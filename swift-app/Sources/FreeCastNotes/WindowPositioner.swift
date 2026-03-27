import AppKit

enum WindowPositioner {

    /// Position window near the mouse cursor, clamped to screen bounds
    static func positionNearCursor(_ window: NSWindow) {
        let mouseLocation = NSEvent.mouseLocation
        let windowSize = window.frame.size

        // Find the screen where the cursor is
        let screen = NSScreen.screens.first(where: { NSMouseInRect(mouseLocation, $0.frame, false) })
            ?? NSScreen.main
            ?? NSScreen.screens.first

        guard let screenFrame = screen?.visibleFrame else { return }

        // Center horizontally on cursor, position slightly above cursor
        let desiredX = mouseLocation.x - windowSize.width / 2
        let desiredY = mouseLocation.y - 56

        // Clamp to screen bounds with margin
        let margin: CGFloat = 14
        let x = max(screenFrame.minX + margin,
                     min(desiredX, screenFrame.maxX - windowSize.width - margin))
        let y = max(screenFrame.minY + margin,
                     min(desiredY, screenFrame.maxY - windowSize.height - margin))

        window.setFrameOrigin(NSPoint(x: x, y: y))
    }

    /// Show window on top at its current frame origin
    static func showOnTop(_ window: NSWindow) {
        window.orderOut(nil) // Hide first to reset state
        window.setIsVisible(true)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Toggle window visibility
    static func toggle(_ window: NSWindow) {
        if window.isVisible {
            window.orderOut(nil)
        } else {
            showOnTop(window)
        }
    }
}
