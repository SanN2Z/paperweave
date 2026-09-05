import CoreGraphics
import Foundation

// Read the test application's own normal windows, without Accessibility access.
let pid = Int(CommandLine.arguments[1])!
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let own = windows.filter {
    ($0[kCGWindowOwnerPID as String] as? Int) == pid &&
    ($0[kCGWindowLayer as String] as? Int) == 0
}.map { ["id": $0[kCGWindowNumber as String] ?? 0,
         "title": $0[kCGWindowName as String] ?? "",
         "bounds": $0[kCGWindowBounds as String] ?? [:]] }
let data = try JSONSerialization.data(withJSONObject: own, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
