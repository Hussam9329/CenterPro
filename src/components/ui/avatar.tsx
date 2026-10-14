'use client';

import Image from 'next/image';

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string; size?: string | number }) { const style = typeof size === 'number' ? { width: size, height: size } : undefined; return <span className={`avatar avatar-${size}`} style={style}>{src ? <Image src={src} alt={name} width={80} height={80} unoptimized/> : name.split(' ').slice(0,2).map(s => s[0]).join('')}</span>; }
