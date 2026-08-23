import Foundation
import AppKit
import ApplicationServices
import CryptoKit

let maxInputBytes = 64 * 1024
let identifierAttribute = "AXIdentifier" as CFString

struct InvokeRequest: Decodable {
    let version: Int
    let kind: String
    let ticketId: String
    let proposalId: String
    let normalizedArgumentsDigest: String
    let platform: String
    let appId: String
    let windowId: String
    let controlId: String
    let action: String
    let expectedStateDigest: String
}

struct ExecutionResponse: Encodable {
    let version: Int
    let kind: String
    let effectStarted: Bool
    let transport: String
    let detailCode: String
    let postStateDigest: String?
}

enum DesktopError: Error { case invalidInput, targetMissing, targetAmbiguous, traversalLimit }

func readInput() throws -> Data {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    if data.isEmpty || data.count > maxInputBytes { throw DesktopError.invalidInput }
    return data
}

func validIdentity(_ value: String) -> Bool {
    !value.isEmpty && value.utf8.count <= 512 && !value.contains("\r") && !value.contains("\n") && !value.contains("\0")
}

func lowerHex64(_ value: String) -> Bool {
    value.utf8.count == 64 && value.allSatisfy { ($0 >= "0" && $0 <= "9") || ($0 >= "a" && $0 <= "f") }
}

func attr(_ element: AXUIElement, _ name: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name, &value) == .success ? value : nil
}

func stringAttr(_ element: AXUIElement, _ name: CFString) -> String { (attr(element, name) as? String) ?? "" }
func boolAttr(_ element: AXUIElement, _ name: CFString) -> Bool { (attr(element, name) as? Bool) ?? false }
func elementsAttr(_ element: AXUIElement, _ name: CFString) -> [AXUIElement] { (attr(element, name) as? [AXUIElement]) ?? [] }
func clean(_ value: String) -> String { value.replacingOccurrences(of: "\r", with: " ").replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\0", with: " ").trimmingCharacters(in: .whitespacesAndNewlines) }
func sha256(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }

func exactRunningApplication(bundleId: String) throws -> NSRunningApplication {
    let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).filter { !$0.isTerminated }
    if apps.isEmpty { throw DesktopError.targetMissing }
    if apps.count != 1 { throw DesktopError.targetAmbiguous }
    return apps[0]
}

func exactWindow(_ app: AXUIElement, windowId: String) throws -> AXUIElement {
    let matches = elementsAttr(app, kAXWindowsAttribute as CFString).filter { window in
        let identifier = stringAttr(window, identifierAttribute)
        return identifier.isEmpty ? stringAttr(window, kAXTitleAttribute as CFString) == windowId : identifier == windowId
    }
    if matches.isEmpty { throw DesktopError.targetMissing }
    if matches.count != 1 { throw DesktopError.targetAmbiguous }
    return matches[0]
}

func exactControl(_ window: AXUIElement, controlId: String) throws -> AXUIElement {
    var queue = elementsAttr(window, kAXChildrenAttribute as CFString)
    var index = 0
    var matches: [AXUIElement] = []
    while index < queue.count {
        if index >= 10_000 { throw DesktopError.traversalLimit }
        let element = queue[index]
        index += 1
        if stringAttr(element, identifierAttribute) == controlId { matches.append(element) }
        let children = elementsAttr(element, kAXChildrenAttribute as CFString)
        if queue.count + children.count > 10_000 { throw DesktopError.traversalLimit }
        queue.append(contentsOf: children)
    }
    if matches.isEmpty { throw DesktopError.targetMissing }
    if matches.count != 1 { throw DesktopError.targetAmbiguous }
    return matches[0]
}

func resolve(_ request: InvokeRequest) throws -> (NSRunningApplication, AXUIElement, AXUIElement) {
    let running = try exactRunningApplication(bundleId: request.appId)
    let app = AXUIElementCreateApplication(running.processIdentifier)
    AXUIElementSetMessagingTimeout(app, 3.0)
    return (running, try exactWindow(app, windowId: request.windowId), try exactControl(try exactWindow(app, windowId: request.windowId), controlId: request.controlId))
}

func stateDigest(request: InvokeRequest, running: NSRunningApplication, window: AXUIElement, control: AXUIElement) -> String {
    let windowIdentifier = stringAttr(window, identifierAttribute)
    let windowIdentity = windowIdentifier.isEmpty ? stringAttr(window, kAXTitleAttribute as CFString) : windowIdentifier
    return sha256([
        "CIEAV_DESKTOP_UI_STATE_V1",
        request.appId,
        clean(windowIdentity),
        clean(stringAttr(window, kAXTitleAttribute as CFString)),
        clean(stringAttr(control, identifierAttribute)),
        clean(stringAttr(control, kAXTitleAttribute as CFString)),
        clean(stringAttr(control, kAXRoleAttribute as CFString)),
        boolAttr(control, kAXEnabledAttribute as CFString) ? "enabled=1" : "enabled=0",
        boolAttr(control, kAXFocusedAttribute as CFString) ? "focused=1" : "focused=0",
        "pid=\(running.processIdentifier)"
    ].joined(separator: "\n"))
}

func emit(_ effectStarted: Bool, _ transport: String, _ detailCode: String, _ post: String? = nil) {
    let response = ExecutionResponse(version: 1, kind: "EXECUTION_RESULT", effectStarted: effectStarted, transport: transport, detailCode: detailCode, postStateDigest: post)
    if let data = try? JSONEncoder().encode(response) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}

do {
    guard AXIsProcessTrusted() else { emit(false, "REJECTED", "ACCESSIBILITY_NOT_TRUSTED"); exit(0) }
    let request = try JSONDecoder().decode(InvokeRequest.self, from: readInput())
    guard request.version == 1, request.kind == "INVOKE", request.platform == "darwin", request.action == "INVOKE",
          UUID(uuidString: request.ticketId) != nil, UUID(uuidString: request.proposalId) != nil,
          lowerHex64(request.normalizedArgumentsDigest), lowerHex64(request.expectedStateDigest),
          validIdentity(request.appId), validIdentity(request.windowId), validIdentity(request.controlId) else { throw DesktopError.invalidInput }

    let resolved: (NSRunningApplication, AXUIElement, AXUIElement)
    do { resolved = try resolve(request) } catch { emit(false, "REJECTED", "TARGET_NOT_EXACT"); exit(0) }
    let before = stateDigest(request: request, running: resolved.0, window: resolved.1, control: resolved.2)
    guard before == request.expectedStateDigest else { emit(false, "REJECTED", "PRESTATE_MISMATCH"); exit(0) }
    guard boolAttr(resolved.2, kAXEnabledAttribute as CFString) else { emit(false, "REJECTED", "CONTROL_NOT_INVOKABLE_STATE"); exit(0) }

    let actions = ((attr(resolved.2, kAXAllowedValuesAttribute as CFString) as? [String]) ?? [])
    _ = actions
    let result = AXUIElementPerformAction(resolved.2, kAXPressAction as CFString)
    guard result == .success else { emit(true, "UNKNOWN", "AX_PRESS_FAILED"); exit(0) }

    var post: String? = nil
    if let after = try? resolve(request) { post = stateDigest(request: request, running: after.0, window: after.1, control: after.2) }
    emit(true, "ACCEPTED", "AX_PRESS_DISPATCHED", post)
    exit(0)
} catch {
    exit(2)
}
