import Foundation
import UserNotifications

let maxInputBytes = 64_000

struct ApprovalPayload: Codable {
    let version: String
    let challengeId: String
    let deviceId: String
    let requestId: String
    let proposalId: String
    let proposalDigest: String
    let principalId: String
    let resource: String
    let risk: String
    let decision: String
    let expiresAt: String
    let nonce: String
    let authority: Bool
    let executionAuthorityIssued: Bool
}
struct ApprovalCapability: Codable { let payload: ApprovalPayload; let mac: String }
struct ApprovalUiRequest: Codable {
    let version: String
    let title: String
    let message: String
    let risk: String
    let expiresAt: String
    let callbackUrl: String
    let approve: ApprovalCapability
    let deny: ApprovalCapability
}
struct CallbackBody: Codable { let capability: ApprovalCapability }

func clean(_ value: String, _ max: Int) -> String {
    let text = value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    return String(text.prefix(max))
}
func isHex(_ value: String, count: Int) -> Bool {
    value.count == count && value.unicodeScalars.allSatisfy { CharacterSet(charactersIn: "0123456789abcdefABCDEF").contains($0) }
}
func validateCapability(_ capability: ApprovalCapability) throws {
    let p = capability.payload
    guard p.version == "CIEAV_NATIVE_APPROVAL_ACTIVATION_V1", !p.authority, !p.executionAuthorityIssued else { throw NSError(domain:"CIEAV",code:10) }
    guard UUID(uuidString:p.challengeId) != nil, UUID(uuidString:p.proposalId) != nil else { throw NSError(domain:"CIEAV",code:11) }
    guard (8...128).contains(p.requestId.count), (8...200).contains(p.deviceId.count), (1...240).contains(p.principalId.count), (1...500).contains(p.resource.count) else { throw NSError(domain:"CIEAV",code:12) }
    guard isHex(p.proposalDigest,count:64), isHex(p.nonce,count:64), ["APPROVED","DENIED"].contains(p.decision) else { throw NSError(domain:"CIEAV",code:13) }
    guard capability.mac.count == 43, capability.mac.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }) else { throw NSError(domain:"CIEAV",code:14) }
}
func callbackURL(_ raw: String) throws -> URL {
    guard let url = URL(string:raw), url.scheme == "http", url.host == "127.0.0.1", url.path == "/api/native-approval", url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, let port = url.port, (1024...65535).contains(port) else { throw NSError(domain:"CIEAV",code:20) }
    return url
}
func parseDate(_ raw: String) throws -> Date {
    let f = ISO8601DateFormatter();f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
    if let d=f.date(from:raw){return d}
    f.formatOptions=[.withInternetDateTime]
    guard let d=f.date(from:raw) else { throw NSError(domain:"CIEAV",code:21) };return d
}

let input = FileHandle.standardInput.readDataToEndOfFile()
guard input.count <= maxInputBytes else { exit(2) }
let decoder = JSONDecoder()
let request: ApprovalUiRequest
do { request = try decoder.decode(ApprovalUiRequest.self, from:input);try validateCapability(request.approve);try validateCapability(request.deny) } catch { exit(2) }
guard request.version == "CIEAV_NATIVE_APPROVAL_UI_V1" else { exit(2) }
let callback: URL
do { callback = try callbackURL(request.callbackUrl) } catch { exit(3) }
let expiresAt: Date
do { expiresAt = try parseDate(request.expiresAt) } catch { exit(4) }
guard expiresAt > Date() else { exit(4) }
let a=request.approve.payload,d=request.deny.payload
guard a.challengeId==d.challengeId,a.deviceId==d.deviceId,a.proposalDigest==d.proposalDigest,a.decision=="APPROVED",d.decision=="DENIED",a.expiresAt==d.expiresAt else { exit(5) }

autoReleaseNotificationAuthorization: do {
    let semaphore=DispatchSemaphore(value:0);var granted=false
    UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.sound]) { ok,_ in granted=ok;semaphore.signal() }
    _=semaphore.wait(timeout:.now()+5)
    if !granted { exit(8) }
}

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    private let challengeId:String
    private let lock=NSLock()
    private(set) var decision:String?
    init(challengeId:String){self.challengeId=challengeId}
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler:@escaping(UNNotificationPresentationOptions)->Void){completionHandler([.banner,.sound])}
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response:UNNotificationResponse, withCompletionHandler completionHandler:@escaping()->Void){defer{completionHandler()};guard response.notification.request.identifier==challengeId else{return};let value=response.actionIdentifier;if value=="CIEAV_APPROVE"||value=="CIEAV_DENY"{lock.lock();if decision==nil{decision=value};lock.unlock()}}
    func takeDecision()->String?{lock.lock();defer{lock.unlock()};return decision}
}

let center=UNUserNotificationCenter.current(),delegate=NotificationDelegate(challengeId:a.challengeId);center.delegate=delegate
let approveAction=UNNotificationAction(identifier:"CIEAV_APPROVE",title:"Allow once",options:[])
let denyAction=UNNotificationAction(identifier:"CIEAV_DENY",title:"Block",options:[.destructive])
center.setNotificationCategories([UNNotificationCategory(identifier:"CIEAV_APPROVAL",actions:[approveAction,denyAction],intentIdentifiers:[],options:[.customDismissAction])])
let content=UNMutableNotificationContent();content.title=clean(request.title,80);content.body=clean(request.message,220)+"\nRisk: \(clean(request.risk,16))";content.categoryIdentifier="CIEAV_APPROVAL";content.sound=.default
let notificationRequest=UNNotificationRequest(identifier:a.challengeId,content:content,trigger:nil)
let addSemaphore=DispatchSemaphore(value:0);var addFailed=false
center.add(notificationRequest){error in addFailed=error != nil;addSemaphore.signal()};_=addSemaphore.wait(timeout:.now()+5);if addFailed{exit(7)}

while Date()<expiresAt && delegate.takeDecision()==nil { RunLoop.current.run(mode:.default,before:Date(timeIntervalSinceNow:0.1)) }
guard let decision=delegate.takeDecision() else { center.removeDeliveredNotifications(withIdentifiers:[a.challengeId]);exit(0) }
let capability=decision=="CIEAV_APPROVE" ? request.approve : request.deny

final class NoRedirectDelegate:NSObject,URLSessionTaskDelegate {
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
}
let bodyData:Data
do { bodyData=try JSONEncoder().encode(CallbackBody(capability:capability)) } catch { exit(6) }
var post=URLRequest(url:callback);post.httpMethod="POST";post.httpBody=bodyData;post.timeoutInterval=3;post.setValue("application/json","Content-Type");post.setValue(String(bodyData.count),"Content-Length")
let sessionConfig=URLSessionConfiguration.ephemeral;sessionConfig.connectionProxyDictionary=[:];sessionConfig.httpShouldSetCookies=false;sessionConfig.urlCache=nil
let session=URLSession(configuration:sessionConfig,delegate:NoRedirectDelegate(),delegateQueue:nil);let callbackSemaphore=DispatchSemaphore(value:0);var callbackOK=false
session.dataTask(with:post){_,response,_ in if let http=response as? HTTPURLResponse{callbackOK=(200...299).contains(http.statusCode)};callbackSemaphore.signal()}.resume();_=callbackSemaphore.wait(timeout:.now()+4);session.invalidateAndCancel();center.removeDeliveredNotifications(withIdentifiers:[a.challengeId]);exit(callbackOK ? 0 : 6)
