import { Fragment, type ReactNode } from 'react';

// Renderizador mínimo y seguro (sin HTML crudo) para políticas en Markdown:
// encabezados #, ##, ###; párrafos; listas - y 1.; **negritas**; *cursivas*; > citas; ---.

function enLinea(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const t = m[0];
    partes.push(t.startsWith('**') ? <strong key={k++}>{t.slice(2, -2)}</strong> : <em key={k++}>{t.slice(1, -1)}</em>);
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export function Markdown({ texto, className = '' }: { texto: string; className?: string }) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n');
  const bloques: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const nivel = Math.min(h[1].length + 1, 5);
      const Tag = `h${nivel}` as 'h2';
      bloques.push(<Tag key={k++}>{enLinea(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(l)) {
      bloques.push(<hr key={k++} />);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^\s*[-*]\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*[-*]\s+/, ''));
      bloques.push(<ul key={k++}>{items.map((t, j) => <li key={j}>{enLinea(t)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^\s*\d+[.)]\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*\d+[.)]\s+/, ''));
      bloques.push(<ol key={k++}>{items.map((t, j) => <li key={j}>{enLinea(t)}</li>)}</ol>);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const items: string[] = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) items.push(lineas[i++].replace(/^>\s?/, ''));
      bloques.push(<blockquote key={k++}>{enLinea(items.join(' '))}</blockquote>);
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|---|\s*[-*]\s|\s*\d+[.)]\s|>)/.test(lineas[i])) parrafo.push(lineas[i++]);
    bloques.push(<p key={k++}>{parrafo.map((t, j) => <Fragment key={j}>{j > 0 && ' '}{enLinea(t)}</Fragment>)}</p>);
  }
  return <div className={`markdown ${className}`}>{bloques}</div>;
}
