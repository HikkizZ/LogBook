/** Vista aún sin construir. El título (`h1`) lo pone la barra superior. */
export function PlaceholderPage({ note }: { note: string }) {
  return <p className="text-fg-muted">{note}</p>;
}
