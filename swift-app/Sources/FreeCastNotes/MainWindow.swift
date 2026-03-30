import AppKit

class MainWindow: NSWindow {

    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 650, height: 700),
            styleMask: [.borderless, .resizable],
            backing: .buffered,
            defer: false
        )

        // Window appearance — transparent so CSS border-radius shows through
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = false

        // Size constraints (fixed width, variable height)
        minSize = NSSize(width: 300, height: 400)
        maxSize = NSSize(width: NSScreen.main?.frame.width ?? 1800, height: NSScreen.main?.frame.height ?? 1200)

        // Floating behavior
        level = .floating
        hidesOnDeactivate = false

        // ✅ THE FIX — This is why we're migrating to Swift!
        collectionBehavior = [
            .canJoinAllSpaces,       // Visible on ALL macOS spaces
            .fullScreenAuxiliary,    // Works alongside fullscreen apps
            .stationary              // Stays when switching spaces
        ]

        // Center on screen initially
        center()
    }

    // Allow the window to become key (receive keyboard input)
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    // Window dragging is handled via JS bridge → WebViewController
}
