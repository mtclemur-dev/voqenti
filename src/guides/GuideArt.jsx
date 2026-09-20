const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Frame({ children, className, decorative, title, desc, labelId }) {
  return (
    <svg
      className={className}
      viewBox="0 0 160 100"
      fill="none"
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-labelledby={!decorative && title ? labelId : undefined}
    >
      {!decorative && title ? <title id={labelId}>{title}</title> : null}
      {!decorative && desc ? <desc>{desc}</desc> : null}
      {children}
    </svg>
  )
}

function ShoeSvg({ children, className, decorative, title, desc, labelId }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 64"
      fill="none"
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-labelledby={!decorative && title ? labelId : undefined}
    >
      {!decorative && title ? <title id={labelId}>{title}</title> : null}
      {!decorative && desc ? <desc>{desc}</desc> : null}
      {children}
    </svg>
  )
}

function ShoeCasualInner() {
  return (
    <>
      <path d="M10 40c8-2 18-12 28-12h18c6 0 12 6 14 12v6H12l-2-6Z" {...stroke} />
      <path d="M20 28c4-6 10-10 18-10" {...stroke} />
      <path d="M14 46h52" {...stroke} />
    </>
  )
}

function ShoeGripInner() {
  return (
    <>
      <path d="M8 38c10-3 20-14 32-14h16c8 0 14 8 16 14v8H10l-2-8Z" {...stroke} />
      <path d="M28 24v-6h10v6" {...stroke} />
      <path d="M12 50h10M26 50h10M40 50h10M54 50h10" {...stroke} />
    </>
  )
}

function ShoeProtectInner() {
  return (
    <>
      <path d="M8 38c10-3 18-13 30-13h16c8 0 16 8 18 14v9H10l-2-10Z" {...stroke} />
      <path d="M52 25c8 1 14 8 16 14" {...stroke} />
      <path d="M28 25v-7h12v7" {...stroke} />
      <path d="M12 52h56" {...stroke} />
    </>
  )
}

function ShoeWornInner() {
  return (
    <>
      <path d="M10 40c8-2 18-12 28-12h18c6 0 12 6 14 12v6H12l-2-6Z" {...stroke} />
      <path d="M22 48c4 3 8-2 12 1M48 48c3 3 7-1 10 2" {...stroke} />
      <path d="M36 28 32 22" {...stroke} />
    </>
  )
}

const scenes = {
  heavyObject: (props) => (
    <Frame {...props}>
      <path d="M28 78h36" {...stroke} />
      <path d="M34 78c2-10 8-16 14-16s12 6 14 16" {...stroke} />
      <rect x="58" y="18" width="28" height="22" rx="3" {...stroke} />
      <path d="M72 40v10" {...stroke} />
    </Frame>
  ),
  nailFloor: (props) => (
    <Frame {...props}>
      <path d="M18 78h124" {...stroke} />
      <path d="M70 78V48" {...stroke} />
      <path d="M62 48h16l-2-6H64l-2 6Z" {...stroke} />
      <path d="M40 70 28 58M120 72l12-10" {...stroke} />
    </Frame>
  ),
  wetFloor: (props) => (
    <Frame {...props}>
      <path d="M16 70c18-8 36 8 54 0s36 8 74 0" {...stroke} />
      <path d="M28 82c14-6 28 6 42 0s30 6 62 0" {...stroke} />
      <path d="M48 38c8-12 24-12 32 0" {...stroke} />
      <path d="M64 28v-8" {...stroke} />
    </Frame>
  ),
  chemicals: (props) => (
    <Frame {...props}>
      <path d="M58 78V42h16l6-12H64l6-12H54l6 12H48l6 12h16" {...stroke} />
      <path d="M54 78h24" {...stroke} />
      <path d="M96 36c8 0 12 8 8 14" {...stroke} />
    </Frame>
  ),
  siteDebris: (props) => (
    <Frame {...props}>
      <path d="M20 78h120" {...stroke} />
      <path d="M36 78 52 48h24l16 30" {...stroke} />
      <path d="M96 78 108 58l16 8" {...stroke} />
      <path d="M28 64h14" {...stroke} />
    </Frame>
  ),
}

const shoes = {
  shoeCasual: (props) => (
    <ShoeSvg {...props}><ShoeCasualInner /></ShoeSvg>
  ),
  shoeGrip: (props) => (
    <ShoeSvg {...props}><ShoeGripInner /></ShoeSvg>
  ),
  shoeProtect: (props) => (
    <ShoeSvg {...props}><ShoeProtectInner /></ShoeSvg>
  ),
  shoeWorn: (props) => (
    <ShoeSvg {...props}><ShoeWornInner /></ShoeSvg>
  ),
}

export function GuideArt({ name, className = 'h-28 w-full text-cyan-200', decorative = true, title, desc }) {
  const Svg = scenes[name] || shoes[name]
  if (!Svg) return null
  return <Svg className={className} decorative={decorative} title={title} desc={desc} labelId={`guide-art-${name}`} />
}
