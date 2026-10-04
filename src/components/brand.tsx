import Image from 'next/image';
export function Brand({ compact = false, reversed = false }: { compact?: boolean; reversed?: boolean }) {
  const width = compact ? 38 : 175;
  const height = compact ? 38 : 51;
  const light = compact ? '/brand/symbol.svg' : '/brand/logo.svg';
  const dark = compact ? '/brand/symbol-white.svg' : '/brand/logo-white.svg';
  return <span className={`brand ${reversed ? 'brand-reversed' : ''}`} dir="ltr">{reversed
    ? <Image src={dark} width={width} height={height} alt="CenterPro" priority/>
    : <><Image className="brand-logo-light" src={light} width={width} height={height} alt="CenterPro" priority/><Image className="brand-logo-dark" src={dark} width={width} height={height} alt="CenterPro" priority/></>}
  </span>;
}
