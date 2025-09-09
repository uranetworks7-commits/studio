
"use client";

import { Plane } from 'lucide-react';
import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

interface GoldFlyAnimationProps {
    gameState: 'idle' | 'running' | 'finished';
    bet: { direction: 'up' | 'down', amount: number } | null;
    altitude: number;
}

export const GoldFlyAnimation = forwardRef<HTMLDivElement, GoldFlyAnimationProps>(({ gameState, bet, altitude }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const betLineRef = useRef<HTMLDivElement>(null);

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


    return (
        <div ref={containerRef} className="w-full h-full bg-blue-900/20 rounded-lg flex items-center justify-center relative overflow-hidden">
            
            {/* Bet Line */}
            <div ref={betLineRef} className="absolute w-full h-0.5 bg-white/50 border-t-2 border-dashed border-white/80" style={{top: '50%'}}>
                 <span className="absolute -top-3 right-2 text-white font-bold text-sm">Bet Line</span>
            </div>

             {/* Live Status */}
            {gameState === 'running' && (
                 <div className={cn("absolute top-4 text-2xl font-bold transition-all duration-300", isProfit ? 'text-green-400' : 'text-red-400')}>
                    {isProfit ? 'You Are in Profit' : 'You Are in Loss'}
                 </div>
            )}
            
            {/* Initial Text */}
            {gameState === 'idle' && (
                <div className="text-center text-white/80">
                    <Plane className="h-24 w-24 mx-auto text-yellow-400" />
                    <p className="text-2xl font-headline mt-4">Place Your Bet</p>
                    <p className="text-muted-foreground">Predict the plane's flight path.</p>
                </div>
            )}


            {gameState === 'running' && (
                <div ref={ref} className={cn("absolute", animationClass)} style={{left: 'calc(50% - 300px)'}}>
                    <Plane className="w-16 h-16 text-yellow-400 -rotate-45" />
                </div>
            )}
             {gameState === 'finished' && bet && (
                 <div className="text-center text-white/80">
                    <Plane className="h-24 w-24 mx-auto text-yellow-400" />
                    <p className="text-2xl font-headline mt-4">Flight Complete</p>
                </div>
            )}
        </div>
    );
});

GoldFlyAnimation.displayName = "GoldFlyAnimation";
