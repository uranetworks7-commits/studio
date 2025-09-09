
"use client";

import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { AreaChart, Area, YAxis, XAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

interface GoldFlyAnimationProps {
    gameState: 'idle' | 'running' | 'finished';
    bet: { direction: 'up' | 'down', amount: number } | null;
    altitude: number;
}

export const GoldFlyAnimation = forwardRef<HTMLDivElement, GoldFlyAnimationProps>(({ gameState, bet, altitude }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pathData, setPathData] = React.useState([{ time: 0, alt: 50 }]);

    const animationClass = useMemo(() => {
        if (gameState !== 'running' || !bet) return '';
        
        const isWinOutcome = Math.random() < 0.70;
        
        if ((bet.direction === 'up' && isWinOutcome) || (bet.direction === 'down' && !isWinOutcome)) {
            return 'animate-projectile-up';
        }
        return 'animate-projectile-down';
    }, [gameState, bet]);

    const isProfit = useMemo(() => {
        if (gameState !== 'running' || !bet) return false;
        
        const betLineAltitude = 50;
        
        if (bet.direction === 'up') return altitude > betLineAltitude;
        if (bet.direction === 'down') return altitude < betLineAltitude;
        return false;

    }, [altitude, bet, gameState]);

     useEffect(() => {
        if (gameState === 'running') {
            const interval = setInterval(() => {
                if (!ref || !(ref as React.RefObject<HTMLDivElement>).current) return;
                const planeElement = (ref as React.RefObject<HTMLDivElement>).current;
                const containerElement = containerRef.current;
                if (!planeElement || !containerElement) return;

                const planeRect = planeElement.getBoundingClientRect();
                const containerRect = containerElement.getBoundingClientRect();
                
                const currentY = planeRect.top - containerRect.top + (planeRect.height / 2);
                const newAltitude = 100 - ((currentY / containerRect.height) * 100);

                const currentX = planeRect.left - containerRect.left + (planeRect.width / 2);
                const newTime = (currentX / containerRect.width) * 100;

                setPathData(prev => [...prev, { time: newTime, alt: newAltitude }].slice(-50));

            }, 100);
            return () => clearInterval(interval);
        } else if (gameState === 'idle') {
             setPathData([{ time: 0, alt: 50 }]);
        }
    }, [gameState, ref]);


    return (
        <div ref={containerRef} className="w-full h-full bg-blue-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
            
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pathData} margin={{ top: 10, right: 0, left: 0, bottom: 10 }}>
                     <defs>
                        <linearGradient id="colorAltitude" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <YAxis domain={[0, 100]} hide={true} />
                    <XAxis dataKey="time" type="number" domain={[0, 100]} hide={true} />
                    <Area type="monotone" dataKey="alt" stroke="hsl(var(--chart-1))" fill="url(#colorAltitude)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <ReferenceLine y={50} stroke="white" strokeDasharray="3 3" />
                </AreaChart>
            </ResponsiveContainer>

             {/* Live Status */}
            {gameState === 'running' && (
                 <div className="absolute top-4 left-4 text-lg font-bold transition-all duration-300 z-20 bg-background/50 px-3 py-1 rounded-md">
                    Altitude: {altitude.toFixed(0)}
                 </div>
            )}
             {gameState === 'running' && (
                 <div className={cn("absolute top-4 flex items-center gap-2 text-xl font-bold transition-all duration-300 z-20", isProfit ? 'text-green-400' : 'text-red-400')}>
                     {isProfit ? <ThumbsUp/> : <ThumbsDown/>}
                    <span>{isProfit ? 'Profit' : 'Loss'}</span>
                 </div>
            )}
            
            {/* Initial Text */}
            {gameState === 'idle' && (
                <div className="text-center text-white/80 z-10">
                   <Image src="https://i.postimg.cc/9fPhgPNN/1757394289552.png" alt="Golden Plane" width={128} height={128} className="mx-auto" />
                </div>
            )}

            {gameState === 'running' && (
                 <div ref={ref} className={cn("absolute top-1/2 left-0 z-10", animationClass)} >
                    <Image src="https://i.postimg.cc/9fPhgPNN/1757394289552.png" alt="Golden Plane" width={128} height={128} />
                </div>
            )}
             {gameState === 'finished' && bet && (
                 <div className="text-center text-white/80 z-10">
                    <Image src="https://i.postimg.cc/9fPhgPNN/1757394289552.png" alt="Golden Plane" width={128} height={128} className="mx-auto" />
                    <p className="text-2xl font-headline mt-4">Flight Complete</p>
                </div>
            )}
        </div>
    );
});

GoldFlyAnimation.displayName = "GoldFlyAnimation";
