export function Sidebar() {
  return (
    <aside className="hidden w-64 border-r bg-muted/40 md:block">
      <nav className="p-4">
        <ul className="space-y-2">
          <li>
            <a href="/" className="block rounded-md px-3 py-2 hover:bg-muted">
              Dashboard
            </a>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
