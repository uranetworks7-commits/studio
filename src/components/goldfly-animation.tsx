
"use client";

import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AreaChart, Area, YAxis, XAxis, ResponsiveContainer } from 'recharts';

const PrivatePlaneIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 512 512" 
        fill="currentColor"
        {...props}
    >
        <path d="M448 192h-78.4l-67.2-67.2L256 192H128l-32-64H32L0 192l32 64h64l32-64h128l64,64h78.4l67.2-67.2L448 192zM256 320l-64-64H64v-64h128l64-64 64 64h128v64H320l-64 64z"/>
    </svg>
);
  

interface GoldFlyAnimationProps {
    gameState: 'idle' | 'running' | 'finished';
    bet: { direction: 'up' | 'down', amount: number } | null;
    altitude: number;
}

export const GoldFlyAnimation = forwardRef<HTMLDivElement, GoldFlyAnimationProps>(({ gameState, bet, altitude }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const betLineRef = useRef<HTMLDivElement>(null);
    const [pathData, setPathData] = React.useState([{ time: 0, alt: 50 }]);


    // Determine the animation class based on a 66% win probability
    const animationClass = useMemo(() => {
        if (gameState !== 'running' || !bet) return '';
        
        const isWinOutcome = Math.random() < 0.66;
        
        if ((bet.direction === 'up' && isWinOutcome) || (bet.direction === 'down' && !isWinOutcome)) {
            return 'animate-projectile-up';
        }
        return 'animate-projectile-down';
    }, [gameState, bet]);

    const isProfit = useMemo(() => {
        if (gameState !== 'running' || !bet || !betLineRef.current) return false;
        const betLineY = betLineRef.current.offsetTop;
        const planeElement = (ref as React.RefObject<HTMLDivElement>)?.current;
        if (!planeElement) return false;
        
        const planeY = planeElement.offsetTop;
        
        if (bet.direction === 'up') return planeY < betLineY;
        if (bet.direction === 'down') return planeY > betLineY;
        return false;

    }, [altitude, bet, gameState, ref]);

     useEffect(() => {
        if (gameState === 'running') {
            const interval = setInterval(() => {
                if (!ref || !(ref as React.RefObject<HTMLDivElement>).current) return;
                const planeElement = (ref as React.RefObject<HTMLDivElement>).current;
                const containerElement = containerRef.current;
                if (!planeElement || !containerElement) return;

                const newAltitude = 100 - ((planeElement.offsetTop / containerElement.clientHeight) * 100);
                const newTime = (planeElement.offsetLeft / containerElement.clientWidth) * 100;
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
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <YAxis domain={[0, 100]} hide={true} />
                    <XAxis dataKey="time" type="number" domain={[0, 100]} hide={true} />
                    <Area type="monotone" dataKey="alt" stroke="hsl(var(--primary))" fill="url(#colorAltitude)" strokeWidth={2} dot={false} />
                </AreaChart>
            </ResponsiveContainer>

            {/* Bet Line */}
            <div ref={betLineRef} className="absolute w-full h-0.5 bg-white/50 border-t-2 border-dashed border-white/80" style={{top: '50%'}}>
                 <span className="absolute -top-3 right-2 text-white font-bold text-sm"></span>
            </div>

             {/* Live Status */}
            {gameState === 'running' && (
                 <div className={cn("absolute top-4 text-2xl font-bold transition-all duration-300", isProfit ? 'text-green-400' : 'text-red-400')}>
                    {isProfit ? 'You Are in Profit' : 'You Are in Loss'}
                 </div>
            )}
            
            {/* Initial Text */}
            {gameState === 'idle' && (
                <div className="text-center text-white/80 z-10">
                    <PrivatePlaneIcon className="h-24 w-24 mx-auto text-yellow-400" />
                    <p className="text-2xl font-headline mt-4">Place Your Bet</p>
                    <p className="text-muted-foreground">Predict the plane's flight path.</p>
                </div>
            )}

            {gameState === 'running' && (
                 <div ref={ref} className={cn("absolute top-1/2 left-0", animationClass)} >
                    <svg 
                        className="w-16 h-16 text-yellow-400"
                        viewBox="0 0 24 24" 
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{transform: 'rotate(15deg)'}}
                    >
                        <path d="M21.43,13.23l-6.3-6.3a2.5,2.5,0,0,0-4.24,0L2.77,15.05a2,2,0,0,0,0,2.82L4,19.17l3.77-3.76,5.3,5.3,3.77-3.77,1.41,1.41a2,2,0,0,0,2.83,0l.35-.35A2.5,2.5,0,0,0,21.43,13.23Z"/>
                    </svg>
                </div>
            )}
             {gameState === 'finished' && bet && (
                 <div className="text-center text-white/80 z-10">
                    <PrivatePlaneIcon className="h-24 w-24 mx-auto text-yellow-400" />
                    <p className="text-2xl font-headline mt-4">Flight Complete</p>
                </div>
            )}
        </div>
    );
});

GoldFlyAnimation.displayName = "GoldFlyAnimation";
