
"use client";

import { simulateTradeGainLoss } from "@/ai/flows/simulate-trade-gain-loss";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  Landmark,
  Loader2,
  MessageSquare,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { get, ref, set } from "firebase/database";
import { PriceChart } from "./price-chart";
import { UserModal } from "./user-modal";

const formSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Please enter a valid number." })
    .positive({ message: "Amount must be positive." }),
  volatility: z.enum(["low", "medium", "high"]),
});

type TradeFormValues = z.infer<typeof formSchema>;

const INITIAL_PRICE = 65000;
const DEFAULT_USD_BALANCE = 1000;
const PRICE_HISTORY_LENGTH = 50;
const CANDLESTICK_INTERVAL = 5; // Aggregate data every 5 ticks

interface PriceData { 
    time: string; 
    price: number;
    ohlc?: [number, number, number, number];
}

// A simple client-side check. In a real app, you might have a dedicated endpoint
// or other mechanism to securely check server-side env var status.
const hasApiKey = process.env.NEXT_PUBLIC_HAS_GEMINI_API_KEY === 'true';

export default function TradingDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrading, setIsTrading] = useState(false);

  const [usdBalance, setUsdBalance] = useState(DEFAULT_USD_BALANCE);
  const [btcBalance, setBtcBalance] = useState(0);
  const [dailyGain, setDailyGain] = useState(0);
  const [dailyLoss, setDailyLoss] = useState(0);

  const [currentPrice, setCurrentPrice] = useState(INITIAL_PRICE);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const [chartType, setChartType] = useState<'area' | 'candlestick'>('area');
  const [priceTrend, setPriceTrend] = useState(0); // For simulating trends

  const { toast } = useToast();

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 100,
      volatility: "medium",
    },
  });

  useEffect(() => {
    const storedUsername = localStorage.getItem("bitsim_username");
    if (storedUsername) {
      handleUserLogin(storedUsername);
    } else {
      setIsModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!username) return;

    const interval = setInterval(() => {
        // Adjust trend randomly
        if (Math.random() < 0.1) { // 10% chance to change trend
            setPriceTrend(Math.random() * 2 - 1); // -1 to 1
        }

        setCurrentPrice((prevPrice) => {
            const baseChange = (Math.random() - 0.49) * 0.005; // Base fluctuation
            const trendEffect = priceTrend * 0.005; // Trend influence
            const newPrice = prevPrice * (1 + baseChange + trendEffect);
            return newPrice;
        });
    }, 2000);

    return () => clearInterval(interval);
  }, [username, priceTrend]);

  useEffect(() => {
    setPriceHistory((prevHistory) => {
        const newTime = new Date();
        const newEntry: PriceData = {
          time: newTime.toLocaleTimeString(),
          price: currentPrice,
        };
    
        let updatedHistory = [...prevHistory, newEntry].filter(p => p.price); // Ensure no invalid price data
    
        if (chartType === 'candlestick') {
            const candleStickReadyHistory = updatedHistory.filter(p => !p.ohlc);
            if (candleStickReadyHistory.length >= CANDLESTICK_INTERVAL) {
                const candleData = candleStickReadyHistory.slice(0, CANDLESTICK_INTERVAL);

                const open = candleData[0].price;
                const close = candleData[candleData.length - 1].price;
                const high = Math.max(...candleData.map(p => p.price));
                const low = Math.min(...candleData.map(p => p.price));
                const candleTime = candleData[0].time;
                
                const candleEntry: PriceData = {
                  time: candleTime.split(':')[0] + ':' + candleTime.split(':')[1],
                  price: close,
                  ohlc: [open, high, low, close]
                };
                
                // Replace the processed raw data with a single candle entry
                const remainingHistory = updatedHistory.slice(CANDLESTICK_INTERVAL);
                
                return [...prevHistory.filter(p=> p.ohlc), candleEntry, ...remainingHistory].slice(-PRICE_HISTORY_LENGTH);
            }
            return updatedHistory;
        } else {
            // Area chart logic, remove OHLC data if switching from candlestick
            const areaHistory = updatedHistory.map(({price, time}) => ({price, time}));
            if (areaHistory.length > PRICE_HISTORY_LENGTH) {
                return areaHistory.slice(areaHistory.length - PRICE_HISTORY_LENGTH);
            }
            return areaHistory;
        }
      });
  }, [currentPrice, chartType]);

  const handleUserLogin = async (name: string) => {
    setUsername(name);
    setIsLoading(true);
    try {
      const userRef = ref(db, `users/${name}`);
      const snapshot = await get(userRef);
      const today = new Date().toISOString().split("T")[0];

      if (snapshot.exists()) {
        const data = snapshot.val();
        setUsdBalance(data.usdBalance);
        setBtcBalance(data.btcBalance);

        if (data.lastTradeDate === today) {
            setDailyGain(data.dailyGain || 0);
            setDailyLoss(data.dailyLoss || 0);
        } else {
            // New day, reset daily stats
            setDailyGain(0);
            setDailyLoss(0);
            await set(ref(db, `users/${name}`), {
                ...data,
                dailyGain: 0,
                dailyLoss: 0,
                lastTradeDate: today,
            });
        }
      } else {
        await set(userRef, {
          usdBalance: DEFAULT_USD_BALANCE,
          btcBalance: 0,
          dailyGain: 0,
          dailyLoss: 0,
          lastTradeDate: today,
        });
        setUsdBalance(DEFAULT_USD_BALANCE);
        setBtcBalance(0);
        setDailyGain(0);
        setDailyLoss(0);
      }
      localStorage.setItem("bitsim_username", name);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Firebase Error",
        description: "Could not fetch user data.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveUsername = (name: string) => {
    handleUserLogin(name);
    setIsModalOpen(false);
  };
  
  const handleFeedback = () => {
    toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback!",
      });
  }

  const handleTrade = async (values: TradeFormValues, type: "buy" | "sell") => {
    setIsTrading(true);
    const { amount: amountInUsd, volatility } = values;

    if (type === "buy" && amountInUsd > usdBalance) {
      toast({ variant: "destructive", description: "Insufficient USD balance." });
      setIsTrading(false);
      return;
    }

    const amountInBtc = amountInUsd / currentPrice;

    if (type === "sell" && amountInBtc > btcBalance) {
      toast({ variant: "destructive", description: "Insufficient BTC balance." });
      setIsTrading(false);
      return;
    }

    if (type === "sell") {
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    let result;
    let tradeError = false;
    try {
        result = await simulateTradeGainLoss({
          amount: amountInBtc,
          currentPrice: currentPrice,
          volatilityProfile: volatility,
        });
    } catch (error) {
        tradeError = true;
        console.warn("AI Trade Simulation Warning:", error);
        
        if (hasApiKey) {
             toast({
              variant: "destructive",
              title: "AI Error",
              description: "Could not use AI simulation. Using fallback. Please check your API key.",
            });
        }
        
        const volatilityMap = { low: 0.01, medium: 0.03, high: 0.06 };
        const changePercent = (Math.random() - 0.5) * 2 * volatilityMap[volatility];
        const newPrice = currentPrice * (1 + changePercent);
        const gainLoss = (newPrice - currentPrice) * amountInBtc;

        result = { newPrice, gainLoss };
    } 
    
    let newUsd, newBtc;
    if (type === "buy") {
      newUsd = usdBalance - amountInUsd;
      newBtc = btcBalance + amountInBtc;
    } else {
      newUsd = usdBalance + amountInUsd;
      newBtc = btcBalance - amountInBtc;
    }
    
    const newDailyGain = result.gainLoss > 0 ? dailyGain + result.gainLoss : dailyGain;
    const newDailyLoss = result.gainLoss < 0 ? dailyLoss + Math.abs(result.gainLoss) : dailyLoss;

    setUsdBalance(newUsd);
    setBtcBalance(newBtc);
    setDailyGain(newDailyGain);
    setDailyLoss(newDailyLoss);
    setCurrentPrice(result.newPrice);

    await set(ref(db, `users/${username}`), {
      usdBalance: newUsd,
      btcBalance: newBtc,
      dailyGain: newDailyGain,
      dailyLoss: newDailyLoss,
      lastTradeDate: new Date().toISOString().split('T')[0],
    });
    
    if (!tradeError) {
      const gainLossText = result.gainLoss >= 0 ? `gain of $${result.gainLoss.toFixed(2)}` : `loss of $${Math.abs(result.gainLoss).toFixed(2)}`;
      
      toast({
        variant: result.gainLoss >= 0 ? "default" : "destructive",
        title: `Trade Successful`,
        description: `Your ${type} order resulted in an instant ${gainLossText}.`,
      });
    }
    
    setIsTrading(false);
  };

  const portfolioValue = usdBalance + btcBalance * currentPrice;
  const todaysPL = dailyGain - dailyLoss;

  if (isLoading && !username) return <UserModal open={isModalOpen} onSave={saveUsername} />;

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-headline font-bold text-primary">URA Trade</h1>
        {username && (
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{username}</span>
             </div>
             <Button variant="outline" size="sm" onClick={handleFeedback}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Feedback
             </Button>
          </div>
        )}
      </header>
      <main className="flex-grow p-4 md:p-8 overflow-auto">
        {isLoading ? (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 min-h-[50vh] lg:min-h-0">
            <PriceChart data={priceHistory} currentPrice={currentPrice} chartType={chartType} />
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Portfolio</CardTitle>
                <CardDescription>Your current assets and total value.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Value</span>
                  <span className="text-2xl font-bold font-headline">${portfolioValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        <span>USD Balance</span>
                    </div>
                  <span>${usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bitcoin className="h-5 w-5 text-primary" />
                        <span>BTC Balance</span>
                    </div>
                  <span>{btcBalance.toFixed(8)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Today's P/L</span>
                  <span className={`font-bold ${todaysPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {todaysPL >= 0 ? '+' : '-'}${Math.abs(todaysPL).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-headline">New Trade</CardTitle>
                <CardDescription>Buy or sell Bitcoin.</CardDescription>
              </CardHeader>
              <Form {...form}>
                <form>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (USD)</FormLabel>
                          <FormControl>
                            <Input placeholder="100.00" {...field} type="number" step="0.01" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="volatility"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Volatility Profile</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select volatility" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                     <FormItem>
                        <FormLabel>Chart Type</FormLabel>
                        <Select onValueChange={(value: 'area' | 'candlestick') => setChartType(value)} defaultValue={chartType}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select chart type" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                            <SelectItem value="area">Area</SelectItem>
                            <SelectItem value="candlestick">Candlestick</SelectItem>
                            </SelectContent>
                        </Select>
                    </FormItem>
                  </CardContent>
                  <CardFooter className="grid grid-cols-2 gap-4">
                    <Button onClick={form.handleSubmit(v => handleTrade(v, 'buy'))} disabled={isTrading}>
                      {isTrading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUp className="mr-2 h-4 w-4" />}
                      Buy
                    </Button>
                    <Button onClick={form.handleSubmit(v => handleTrade(v, 'sell'))} disabled={isTrading} variant="destructive">
                      {isTrading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDown className="mr-2 h-4 w-4" />}
                      Sell
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
