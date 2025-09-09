
"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { AreaChart, Area, YAxis, XAxis, ResponsiveContainer } from 'recharts';
import { Mountain, Zap } from 'lucide-react';
import { GaugeMeter } from './ui/gauge-meter';

interface BitCrashAnimationProps {
    gameState: 'idle' | 'running' | 'blasted' | 'withdrawn';
    gainPercent: number;
    isTurboRound: boolean;
}

export const BitCrashAnimation = forwardRef<HTMLDivElement, BitCrashAnimationProps>(({ gameState, gainPercent, isTurboRound }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const planeRef = useRef<HTMLDivElement>(null);
    const [pathData, setPathData] = useState([{ time: 0, alt: 0 }]);
    const [height, setHeight] = useState(0);

    const animationClass = useMemo(() => {
        if (gameState === 'running') return 'animate-crash-fly';
        if (gameState === 'blasted') return 'animate-crash-blast';
        return '';
    }, [gameState]);

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (gameState === 'running') {
            setPathData([{ time: 0, alt: 0 }]);
            setHeight(0);
            interval = setInterval(() => {
                if (planeRef.current && containerRef.current) {
                    const planeRect = planeRef.current.getBoundingClientRect();
                    const containerRect = containerRef.current.getBoundingClientRect();
                    
                    const currentY = planeRect.top - containerRect.top + (planeRect.height / 2);
                    const newAltitude = 100 - (currentY / containerRect.height) * 100;
                    
                    const currentX = planeRect.left - containerRect.left + (planeRect.width / 2);
                    const newTime = (currentX / containerRect.width) * 100;

                    setPathData(prev => [...prev, { time: newTime, alt: Math.max(0,newAltitude) }].slice(-100));
                    setHeight(prev => prev + Math.random() * 50);
                }
            }, 100);
        } else {
             if (gameState === 'idle') {
                setPathData([{ time: 0, alt: 0 }]);
                setHeight(0);
            }
            if (interval) {
                clearInterval(interval);
            }
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [gameState]);
    
    const showPlane = gameState === 'running' || gameState === 'blasted';

    const dangerLevel = Math.min(100, gainPercent);

    return (
        <div ref={containerRef} className="w-full h-full bg-blue-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
            
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                 {isTurboRound && gameState === 'running' && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded-full border border-yellow-400 text-xs">
                        <Zap className="h-3 w-3" />
                        <span className="font-bold text-xs">TURBO</span>
                    </div>
                )}
                {gameState === 'running' && (
                    <div className="text-center">
                        <p className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg">{gainPercent.toFixed(2)}%</p>
                        <p className="text-sm md:text-lg text-white/80">Gain</p>
                    </div>
                )}
                {gameState === 'idle' && (
                    <div className="text-center text-white/80">
                        <p className="text-xl md:text-3xl font-headline">Prepare for Liftoff</p>
                    </div>
                )}
                 {gameState === 'blasted' && (
                    <div className="text-center text-white/80">
                        <p className="text-3xl md:text-5xl font-bold text-destructive drop-shadow-lg">BLASTED!</p>
                    </div>
                )}
                 {gameState === 'withdrawn' && (
                    <div className="text-center text-white/80">
                         <p className="text-3xl md:text-5xl font-bold text-green-400 drop-shadow-lg">Withdrawn!</p>
                        <p className="text-lg md:text-2xl text-green-400/80">Profit: {gainPercent.toFixed(2)}%</p>
                    </div>
                )}
            </div>
             {gameState === 'running' && (
                <div className="absolute bottom-2 w-11/12 md:w-3/4 lg:w-2/3 flex items-center justify-around gap-1 z-30">
                    <div className="flex flex-col items-center text-white/90 gap-0">
                       <div className='flex items-center gap-1'>
                           <Mountain className="h-3 w-3" />
                           <span className="font-semibold text-xs">Height</span>
                        </div>
                        <span className="font-mono text-base font-bold">{height.toFixed(0)} ft</span>
                    </div>
                    <div className='flex flex-col items-center text-white/90 gap-0'>
                        <span className="font-semibold text-xs">Danger</span>
                        <GaugeMeter value={dangerLevel} size={60} />
                    </div>
                </div>
            )}

            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pathData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorCrash" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <YAxis domain={[0, 100]} hide={true} />
                    <XAxis dataKey="time" type="number" domain={[0, 100]} hide={true} />
                    <Area type="monotone" dataKey="alt" stroke="hsl(var(--chart-1))" fill="url(#colorCrash)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
            </ResponsiveContainer>
            
            {showPlane && (
                 <div ref={planeRef} className={cn("absolute bottom-1/2 left-0 z-10", animationClass)} style={{transform: `translateY(50%)`}}>
                    <Image src="https://i.postimg.cc/9fPhgPNN/1757394289552.png" alt="Golden Plane" width={60} height={60} />
                </div>
            )}
            
        </div>
    );
});

BitCrashAnimation.displayName = "BitCrashAnimation";
