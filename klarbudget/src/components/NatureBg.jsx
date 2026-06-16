/**
 * NatureBg — pure decorative background component.
 * Renders soft organic blobs + nature elements via CSS.
 * Performance-safe: pure CSS animations, no JS timers, no rerender triggers.
 * All elements are pointer-events: none and aria-hidden.
 */

const LEAVES = [
  { top: '8%',  left: '3%',  size: 28, delay: '0s',   dur: '9s',  rot: -20 },
  { top: '18%', right: '5%', size: 22, delay: '2s',   dur: '11s', rot: 15  },
  { top: '45%', left: '1%',  size: 18, delay: '4s',   dur: '8s',  rot: -10 },
  { top: '70%', right: '3%', size: 24, delay: '1s',   dur: '12s', rot: 25  },
  { top: '85%', left: '6%',  size: 16, delay: '3.5s', dur: '10s', rot: -5  },
]

const BLOBS = [
  { top: '-60px', left: '-40px',  w: 260, h: 200, color: 'rgba(5,150,105,.04)' },
  { top: '30%',   right: '-50px', w: 200, h: 240, color: 'rgba(167,243,208,.06)' },
  { bottom: '-40px', left: '20%', w: 300, h: 180, color: 'rgba(254,243,199,.07)' },
]

function LeafSvg({ size, rotation }) {
  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 24 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M12 2 C6 2 2 8 2 14 C2 20 6 26 12 28 C18 26 22 20 22 14 C22 8 18 2 12 2Z"
        fill="rgba(5,150,105,.16)"
      />
      <path
        d="M12 2 C12 2 12 28 12 28"
        stroke="rgba(5,150,105,.20)"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <path
        d="M12 8 C8 10 6 13 7 16"
        stroke="rgba(5,150,105,.12)"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
      <path
        d="M12 8 C16 10 18 13 17 16"
        stroke="rgba(5,150,105,.12)"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GrassBlade({ height, delay, duration, left }) {
  return (
    <svg
      width="8"
      height={height}
      viewBox={`0 0 8 ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute',
        bottom: 0,
        left,
        transformOrigin: 'bottom center',
        animation: `swayGrass ${duration} ${delay} ease-in-out infinite`,
        opacity: 0.18,
      }}
    >
      <path
        d={`M4 ${height} C3 ${height * 0.7} 2 ${height * 0.4} 4 2 C6 ${height * 0.4} 5 ${height * 0.7} 4 ${height}`}
        fill="#059669"
      />
    </svg>
  )
}

export function NatureBg({ variant = 'default' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* Soft blobs */}
      {BLOBS.map((blob, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: blob.top,
            left: blob.left,
            right: blob.right,
            bottom: blob.bottom,
            width: blob.w,
            height: blob.h,
            background: blob.color,
            borderRadius: '60% 40% 54% 46% / 48% 58% 42% 52%',
            animation: `blobDrift ${14 + i * 3}s ease-in-out infinite`,
            animationDelay: `${i * 2}s`,
          }}
        />
      ))}

      {/* Floating leaves */}
      {LEAVES.map((leaf, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: leaf.top,
            left: leaf.left,
            right: leaf.right,
            width: leaf.size,
            animation: `floatLeaf ${leaf.dur} ${leaf.delay} ease-in-out infinite`,
          }}
        >
          <LeafSvg size={leaf.size} rotation={leaf.rot} />
        </div>
      ))}

      {/* Grass blades at bottom */}
      {variant !== 'minimal' && (
        <>
          <GrassBlade height={40} delay="0s"    duration="4s"  left="5%" />
          <GrassBlade height={32} delay="0.5s"  duration="5s"  left="8%" />
          <GrassBlade height={48} delay="1s"    duration="4.5s" left="12%" />
          <GrassBlade height={36} delay="0.3s"  duration="3.8s" left="16%" />
          <GrassBlade height={42} delay="1.5s"  duration="5.2s" left="85%" />
          <GrassBlade height={30} delay="0.8s"  duration="4.1s" left="89%" />
          <GrassBlade height={44} delay="0.2s"  duration="4.8s" left="93%" />
          <GrassBlade height={38} delay="2s"    duration="5.5s" left="97%" />
        </>
      )}
    </div>
  )
}
