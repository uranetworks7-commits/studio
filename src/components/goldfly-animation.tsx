
"use client";

import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

// 2D side-view private plane SVG
const PrivatePlaneIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="currentColor"
      {...props}
    >
        <path d="M448 192H320l-64-64-64 64H64L0 256l64 64h128l64 64 64-64h128l64-64-64-64zM320 320H192l-32-32 32-32h128l32 32-32 32z" />
        <path d="M480 320h-96v-64h96c17.7 0 32 14.3 32 32s-14.3 32-32 32z" />
        <path d="M128 320H32c-17.7 0-32-14.3-32-32s14.3-32 32-32h96v64z" />
        <path d="M320 128H192L160 96h192l-32 32z" />
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
                 <span className="absolute -top-3 right-2 text-white font-bold text-sm">Bet Line (Altitude: 0)</span>
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
                    <PrivatePlaneIcon className="h-24 w-24 mx-auto text-yellow-400" />
                    <p className="text-2xl font-headline mt-4">Place Your Bet</p>
                    <p className="text-muted-foreground">Predict the plane's flight path.</p>
                </div>
            )}


            {gameState === 'running' && (
                <div ref={ref} className={cn("absolute", animationClass)} style={{left: 'calc(50% - 225px)'}}>
                    <PrivatePlaneIcon className="w-16 h-16 text-yellow-400" />
                </div>
            )}
             {gameState === 'finished' && bet && (
                 <div className="text-center text-white/80">
                    <PrivatePlaneIcon className="h-24 w-24 mx-auto text-yellow-400" />
                    <p className="text-2xl font-headline mt-4">Flight Complete</p>
                </div>
            )}
        </div>
    );
});

GoldFlyAnimation.displayName = "GoldFlyAnimation";
