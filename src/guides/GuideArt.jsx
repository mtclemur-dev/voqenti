const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Frame({ children, className, decorative, title, desc, labelId, tall = false }) {
  return (
    <svg
      className={className}
      viewBox={tall ? '0 0 80 64' : '0 0 160 100'}
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

const art = {
  introShoe: (props) => (
    <Frame {...props}>
      <path d="M18 58c14-4 28-22 48-22h28c14 0 28 14 32 22v12H22l-4-12Z" {...stroke} />
      <path d="M78 36v-10h18v10" {...stroke} />
      <path d="M118 38c12 2 22 12 26 20" {...stroke} />
      <path d="M28 76h18M52 76h18M76 76h18M100 76h18M124 76h14" {...stroke} />
      <path d="M24 70h116" {...stroke} />
    </Frame>
  ),
  hazardFall: (props) => (
    <Frame {...props}>
      <path d="M36 84h40" {...stroke} />
      <path d="M44 84c2-12 10-20 16-20s14 8 16 20" {...stroke} />
      <rect x="92" y="14" width="32" height="22" rx="3" {...stroke} />
      <path d="M108 36v16" {...stroke} />
      <path d="M102 56h12" {...stroke} />
    </Frame>
  ),
  hazardCrush: (props) => (
    <Frame {...props}>
      <path d="M28 78h48" {...stroke} />
      <path d="M40 78 52 52h20l12 26" {...stroke} />
      <path d="M96 28h36v36H96V28Z" {...stroke} />
      <path d="M96 46h36" {...stroke} />
    </Frame>
  ),
  hazardSharp: (props) => (
    <Frame {...props}>
      <path d="M16 82h128" {...stroke} />
      <path d="M58 82V46" {...stroke} />
      <path d="M50 46h16l-3-10H53l-3 10Z" {...stroke} />
      <path d="M92 82 108 54l18 10" {...stroke} />
      <path d="M30 70 22 58" {...stroke} />
    </Frame>
  ),
  hazardSlip: (props) => (
    <Frame {...props}>
      <path d="M18 62c20-10 40 8 62 0s40 10 62 0" {...stroke} />
      <path d="M22 78c18-8 36 6 54 0s40 8 62 0" {...stroke} />
      <path d="M58 36c10-14 28-14 38 0" {...stroke} />
      <path d="M76 24v-8" {...stroke} />
    </Frame>
  ),
  hazardChem: (props) => (
    <Frame {...props}>
      <path d="M54 82V48h18l8-16H68l6-14H50l6 14H44l8 16h18" {...stroke} />
      <path d="M48 82h28" {...stroke} />
      <path d="M102 34c10 0 16 10 10 18" {...stroke} />
      <path d="M98 58h20" {...stroke} />
    </Frame>
  ),
  hazardTemp: (props) => (
    <Frame {...props}>
      <path d="M40 78V42a12 12 0 0 1 24 0v36" {...stroke} />
      <path d="M40 62h24" {...stroke} />
      <path d="M96 30c10 8 10 20 0 28s-10 20 0 28" {...stroke} />
      <path d="M112 24c12 10 12 24 0 34s-12 24 0 34" {...stroke} />
    </Frame>
  ),
  roleEmployer: (props) => (
    <Frame {...props}>
      <rect x="28" y="22" width="104" height="58" rx="8" {...stroke} />
      <path d="M48 48h64M48 62h40" {...stroke} />
      <circle cx="44" cy="34" r="4" {...stroke} />
    </Frame>
  ),
  roleWorker: (props) => (
    <Frame {...props}>
      <circle cx="80" cy="32" r="12" {...stroke} />
      <path d="M52 78c6-18 16-26 28-26s22 8 28 26" {...stroke} />
    </Frame>
  ),
  sceneIndoor: (props) => (
    <Frame {...props}>
      <path d="M24 78h112" {...stroke} />
      <path d="M36 78V42h28v36" {...stroke} />
      <path d="M96 78V50h28v28" {...stroke} />
      <path d="M28 62c20-6 40 6 60 0s32 6 44 0" {...stroke} />
    </Frame>
  ),
  sceneWater: (props) => (
    <Frame {...props}>
      <path d="M20 58c18-8 36 8 54 0s36 8 66 0" {...stroke} />
      <path d="M24 74c16-6 32 6 48 0s34 6 64 0" {...stroke} />
      <path d="M70 44c0-10 8-16 16-16" {...stroke} />
      <path d="M54 36h20" {...stroke} />
    </Frame>
  ),
  sceneSite: (props) => (
    <Frame {...props}>
      <path d="M18 80h124" {...stroke} />
      <path d="M32 80 50 46h28l18 34" {...stroke} />
      <path d="M104 80 116 56l20 10" {...stroke} />
      <path d="M26 66h16" {...stroke} />
    </Frame>
  ),
  sceneIndustry: (props) => (
    <Frame {...props}>
      <rect x="22" y="40" width="44" height="38" rx="3" {...stroke} />
      <path d="M22 52h44" {...stroke} />
      <path d="M86 78V36l22-12 22 12v42" {...stroke} />
      <path d="M86 50h44" {...stroke} />
    </Frame>
  ),
  sceneLab: (props) => (
    <Frame {...props}>
      <path d="M36 78V40h20l12-18h-24l8-14h20l8 14H64l12 18h20v38" {...stroke} />
      <path d="M48 78h64" {...stroke} />
    </Frame>
  ),
  sceneWinter: (props) => (
    <Frame {...props}>
      <path d="M20 78c24-8 48 8 72 0s36 8 48 0" {...stroke} />
      <path d="M80 18v28M66 28h28M70 22l20 16M90 22 70 38" {...stroke} />
      <path d="M40 58c6-8 16-8 22 0" {...stroke} />
    </Frame>
  ),
  shoeGood: (props) => (
    <Frame tall {...props}>
      <path d="M8 38c10-3 20-14 32-14h16c8 0 14 8 16 14v8H10l-2-8Z" {...stroke} />
      <path d="M28 24v-6h10v6" {...stroke} />
      <path d="M12 50h10M26 50h10M40 50h10M54 50h10" {...stroke} />
    </Frame>
  ),
  shoeLoose: (props) => (
    <Frame tall {...props}>
      <path d="M8 34c10-3 20-14 32-14h16c8 0 14 8 16 14v6H12l-4-6Z" {...stroke} />
      <path d="M10 48c16 2 28-6 44-2 8 2 16 6 18 10" {...stroke} />
      <path d="M18 42 14 50" {...stroke} />
    </Frame>
  ),
  shoeWorn: (props) => (
    <Frame tall {...props}>
      <path d="M10 38c8-2 18-12 28-12h18c6 0 12 6 14 12v6H12l-2-6Z" {...stroke} />
      <path d="M20 48c5 4 10-2 16 2M48 48c4 4 8-1 12 3" {...stroke} />
      <path d="M34 28 30 22" {...stroke} />
    </Frame>
  ),
}

export function GuideArt({ name, className = 'h-28 w-full text-cyan-200', decorative = true, title, desc }) {
  const Svg = art[name]
  if (!Svg) return null
  return <Svg className={className} decorative={decorative} title={title} desc={desc} labelId={`guide-art-${name}`} />
}
