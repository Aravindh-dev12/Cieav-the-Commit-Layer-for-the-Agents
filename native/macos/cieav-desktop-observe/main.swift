import Foundation
import AppKit
import ApplicationServices
import CryptoKit

let maxInputBytes = 64 * 1024
let identifierAttribute = "AXIdentifier" as CFString

struct ObserveRequest: Decodable {
    let version: Int
    let kind: String
    let platform: String
    let appId: String
    let windowId: String
    let controlId: String
}

struct ObservationResponse: Encodable {
    let version: Int
    let kind: String
    let stateDigest: String
}

enum DesktopError: Error { case invalidInput, accessibilityUnavailable, targetMissing, targetAmbiguous, traversalLimit }

func readInput() throws -> Data {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    if data.isEmpty || data.count > maxInputBytes { throw DesktopError.invalidInput }
    return data
}

func validIdentity(_ value: String) -> Bool {
    !value.isEmpty && value.utf8.count <= 512 && !value.contains("\r") && !value.contains("\n") && !value.contains("\0")
}

func attr(_ element: AXUIElement, _ name: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name, &value) == .success ? value : nil
}

func stringAttr(_ element: AXUIElement, _ name: CFString) -> String {
    (attr(element, name) as? String) ?? ""
}

func boolAttr(_ element: AXUIElement, _ name: CFString) -> Bool {
    (attr(element, name) as? Bool) ?? false
}

func elementsAttr(_ element: AXUIElement, _ name: CFString) -> [AXUIElement] {
    (attr(element, name) as? [AXUIElement]) ?? []
}

func clean(_ value: String) -> String {
    value.replacingOccurrences(of: "\r", with: " ").replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\0", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
}

func sha256(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}

func exactRunningApplication(bundleId: String) throws -> NSRunningApplication {
    let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).filter { !$0.isTerminated }
    if apps.isEmpty { throw DesktopError.targetMissing }
    if apps.count != 1 { throw DesktopError.targetAmbiguous }
    return apps[0]
}

func exactWindow(_ app: AXUIElement, windowId: String) throws -> AXUIElement {
    let windows = elementsAttr(app, kAXWindowsAttribute as CFString)
    let matches = windows.filter { window in
        let identifier = stringAttr(window, identifierAttribute)
        if !identifier.isEmpty { return identifier == windowId }
        return stringAttr(window, kAXTitleAttribute as CFString) == windowId
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

func resolve(_ request: ObserveRequest) throws -> (NSRunningApplication, AXUIElement, AXUIElement) {
    let running = try exactRunningApplication(bundleId: request.appId)
    let app = AXUIElementCreateApplication(running.processIdentifier)
    AXUIElementSetMessagingTimeout(app, 3.0)
    let window = try exactWindow(app, windowId: request.windowId)
    let control = try exactControl(window, controlId: request.controlId)
    return (running, window, control)
}

func stateDigest(request: ObserveRequest, running: NSRunningApplication, window: AXUIElement, control: AXUIElement) -> String {
    let windowIdentifier = stringAttr(window, identifierAttribute)
    let windowIdentity = windowIdentifier.isEmpty ? stringAttr(window, kAXTitleAttribute as CFString) : windowIdentifier
    let material = [
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
    ].joined(separator: "\n")
    return sha256(material)
}

do {
    guard AXIsProcessTrusted() else { exit(3) }
    let request = try JSONDecoder().decode(ObserveRequest.self, from: readInput())
    guard request.version == 1, request.kind == "OBSERVE", request.platform == "darwin",
          validIdentity(request.appId), validIdentity(request.windowId), validIdentity(request.controlId) else { throw DesktopError.invalidInput }
    let resolved = try resolve(request)
    let response = ObservationResponse(version: 1, kind: "OBSERVATION", stateDigest: stateDigest(request: request, running: resolved.0, window: resolved.1, control: resolved.2))
    FileHandle.standardOutput.write(try JSONEncoder().encode(response))
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(0)
} catch {
    exit(2)
}
