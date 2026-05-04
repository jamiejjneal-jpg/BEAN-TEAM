export function SiteFooter({ muted = false }: { muted?: boolean }) {
  return (
    <footer
      className={`mt-12 py-6 text-center text-xs ${muted ? 'text-[#9C8E7A]' : 'text-[#8A8A8A]'}`}
      data-testid="site-footer"
    >
      © {new Date().getFullYear()} Rocky’s Retreat and Rambles · Built with{' '}
      <span aria-hidden>♥</span> by{' '}
      <span className="font-medium">Jamie Neal</span> · All rights reserved.
    </footer>
  )
}
