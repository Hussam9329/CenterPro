import Image from 'next/image';
export function Brand({ compact = false, reversed = false }: { compact?: boolean; reversed?: boolean }) {
  return <span className={`brand ${reversed ? 'brand-reversed' : ''}`} dir="ltr"><Image src={compact ? (reversed ? '/brand/symbol-white.svg' : '/brand/symbol.svg') : (reversed ? '/brand/logo-white.svg' : '/brand/logo.svg')} width={compact ? 38 : 175} height={compact ? 38 : 51} alt="CenterPro" priority/></span>;
}
