
"use client";

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { AreaChart, Area, YAxis, XAxis, ResponsiveContainer } from 'recharts';
import { Progress } from './ui/progress';
import { Mountain, Gauge } from 'lucide-react';

interface BitCrashAnimationProps {
    gameState: 'idle' | 'running' | 'blasted' | 'withdrawn';
    gainPercent: number;
}

export const BitCrashAnimation = forwardRef<HTMLDivElement, BitCrashAnimationProps>(({ gameState, gainPercent }, ref) => {
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
    const dangerColor = dangerLevel < 50 ? 'bg-green-500' : dangerLevel < 80 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div ref={containerRef} className="w-full h-full bg-blue-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
            
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                {gameState === 'running' && (
                    <div className="text-center">
                        <p className="text-5xl font-bold text-white drop-shadow-lg">{gainPercent.toFixed(2)}%</p>
                        <p className="text-lg text-white/80">Gain</p>
                    </div>
                )}
                {gameState === 'idle' && (
                    <div className="text-center text-white/80">
                        <p className="text-3xl font-headline">Prepare for Liftoff</p>
                    </div>
                )}
                 {gameState === 'blasted' && (
                    <div className="text-center text-white/80">
                        <p className="text-5xl font-bold text-destructive drop-shadow-lg">BLASTED!</p>
                    </div>
                )}
                 {gameState === 'withdrawn' && (
                    <div className="text-center text-white/80">
                         <p className="text-5xl font-bold text-green-400 drop-shadow-lg">Withdrawn!</p>
                        <p className="text-2xl text-green-400/80">Profit: {gainPercent.toFixed(2)}%</p>
                    </div>
                )}
            </div>
             {gameState === 'running' && (
                <div className="absolute top-4 w-11/12 md:w-3/4 lg:w-1/2 flex flex-col gap-2 z-30">
                    <div className="flex items-center justify-between text-white/90">
                        <div className='flex items-center gap-2'>
                           <Mountain className="h-5 w-5" />
                           <span className="font-semibold">Height</span>
                        </div>
                        <span className="font-mono">{height.toFixed(0)} ft</span>
                    </div>
                    <div className="flex items-center justify-between text-white/90">
                         <div className='flex items-center gap-2'>
                           <Gauge className="h-5 w-5" />
                           <span className="font-semibold">Danger</span>
                        </div>
                    </div>
                     <Progress value={dangerLevel} className="h-2 [&>div]:bg-red-500" indicatorClassName={dangerColor} />
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
                    <Image src="https://i.postimg.cc/9fPhgPNN/1757394289552.png" alt="Golden Plane" width={128} height={128} />
                </div>
            )}
            
        </div>
    );
});

BitCrashAnimation.displayName = "BitCrashAnimation";
