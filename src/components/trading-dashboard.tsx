
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  Landmark,
  Loader2,
  LogOut,
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
});

type TradeFormValues = z.infer<typeof formSchema>;

const INITIAL_PRICE = 65000;
const PRICE_HISTORY_LENGTH = 50;
const CANDLESTICK_INTERVAL = 5; // Aggregate data every 5 ticks

interface PriceData { 
    time: string; 
    price: number;
    ohlc?: [number, number, number, number];
}

type MarketState = "STABLE" | "TREND_UP" | "TREND_DOWN" | "VOLATILE";

export default function TradingDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [usdBalance, setUsdBalance] = useState<number | null>(null);
  const [btcBalance, setBtcBalance] = useState<number | null>(null);
  const [dailyGain, setDailyGain] = useState(0);
  const [dailyLoss, setDailyLoss] = useState(0);

  const [currentPrice, setCurrentPrice] = useState(INITIAL_PRICE);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const [chartType, setChartType] = useState<'area' | 'candlestick'>('area');
  
  const [marketState, setMarketState] = useState<MarketState>("STABLE");

  const { toast } = useToast();

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 100,
    },
  });

  useEffect(() => {
    const storedUsername = localStorage.getItem("bitsim_username");
    if (storedUsername) {
      handleUserLogin(storedUsername);
    } else {
      setIsModalOpen(true);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!username) return;
  
    // This interval changes the market state periodically.
    const marketStateInterval = setInterval(() => {
      const states: MarketState[] = ["STABLE", "TREND_UP", "TREND_DOWN", "VOLATILE"];
      const nextState = states[Math.floor(Math.random() * states.length)];
      setMarketState(nextState);
    }, 15000); // Change market state every 15 seconds
  
    // This interval updates the price based on the current market state.
    const priceUpdateInterval = setInterval(() => {
      setCurrentPrice((prevPrice) => {
        let changePercent = 0;
  
        switch (marketState) {
          case "STABLE":
            changePercent = (Math.random() - 0.5) * 0.002; // Very small fluctuations
            break;
          case "TREND_UP":
            changePercent = (Math.random() * 0.005); // Consistent small gains
            break;
          case "TREND_DOWN":
            changePercent = (Math.random() * -0.005); // Consistent small losses
            break;
          case "VOLATILE":
            changePercent = (Math.random() - 0.5) * 0.02; // Wider fluctuations
            break;
        }
        
        // Add a small chance for a "black swan" event for excitement
        if (Math.random() < 0.02) { 
            changePercent *= 5;
        }

        const newPrice = prevPrice * (1 + changePercent);
        return newPrice > 0 ? newPrice : prevPrice; // Prevent price from going to zero
      });
    }, 1000);
  
    return () => {
      clearInterval(marketStateInterval);
      clearInterval(priceUpdateInterval);
    };
  }, [username, marketState]);

  useEffect(() => {
    if (!username) return;
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
  }, [currentPrice, chartType, username]);

  const handleUserLogin = async (name: string) => {
    setIsLoading(true);
    try {
      const userRef = ref(db, `users/${name}`);
      const snapshot = await get(userRef);
      const today = new Date().toISOString().split("T")[0];

      if (snapshot.exists()) {
        const data = snapshot.val();
        let userUsdBalance = data.usdBalance ?? 0;

        if (userUsdBalance === 0) {
            userUsdBalance = 1;
        }

        setUsdBalance(userUsdBalance);
        setBtcBalance(data.btcBalance ?? 0);

        if (data.lastTradeDate === today) {
            setDailyGain(data.dailyGain ?? 0);
            setDailyLoss(data.dailyLoss ?? 0);
        } else {
            // New day, reset daily stats
            setDailyGain(0);
            setDailyLoss(0);
        }

        // Update database if balance was zero or if it's a new day
        if (data.usdBalance === 0 || data.lastTradeDate !== today) {
             await set(ref(db, `users/${name}`), {
                ...data,
                usdBalance: userUsdBalance,
                dailyGain: 0,
                dailyLoss: 0,
                lastTradeDate: today,
            });
        }
        
        setUsername(name);
        localStorage.setItem("bitsim_username", name);
        setIsModalOpen(false);
        setIsLoading(false);
        return true;
      } else {
        localStorage.removeItem("bitsim_username");
        setIsModalOpen(true);
        setIsLoading(false);
        return false;
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Firebase Error",
        description: "Could not retrieve user data.",
      });
      setIsLoading(false);
      return false;
    }
  };

  const handleLogout = () => {
    setUsername(null);
    setUsdBalance(null);
    setBtcBalance(null);
    setDailyGain(0);
    setDailyLoss(0);
    setPriceHistory([]);
    localStorage.removeItem("bitsim_username");
    setIsModalOpen(true);
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
    });
  };

  const handleFeedback = () => {
    toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback!",
      });
  }

  const runSimpleTradeSimulation = (amountInBtc: number) => {
      // The trade simulation now reflects the current market state.
      let changePercent = 0;
      switch (marketState) {
          case "STABLE":
              changePercent = (Math.random() - 0.5) * 0.005; // Less slippage in stable market
              break;
          case "TREND_UP":
              changePercent = (Math.random() * 0.008); // Price might slip upwards
              break;
          case "TREND_DOWN":
              changePercent = (Math.random() * -0.008); // Price might slip downwards
              break;
          case "VOLATILE":
              changePercent = (Math.random() - 0.5) * 0.03; // High slippage
              break;
      }
      
      const newPrice = currentPrice * (1 + changePercent);
      const gainLoss = (newPrice - currentPrice) * amountInBtc;
      return { newPrice, gainLoss };
  }

  const handleTrade = async (values: TradeFormValues, type: "buy" | "sell") => {
    const currentUsdBalance = usdBalance ?? 0;
    const currentBtcBalance = btcBalance ?? 0;
    const currentDailyGain = dailyGain ?? 0;
    const currentDailyLoss = dailyLoss ?? 0;
    
    if (isNaN(currentUsdBalance) || isNaN(currentBtcBalance) || isNaN(currentDailyGain) || isNaN(currentDailyLoss)) {
        toast({ variant: "destructive", description: "Invalid balance or P/L data. Please try again." });
        return;
    }

    const { amount: amountInUsd } = values;

    if (type === "buy" && amountInUsd > currentUsdBalance) {
      toast({ variant: "destructive", description: "Insufficient USD balance." });
      return;
    }

    const amountInBtc = amountInUsd / currentPrice;

    if (type === "sell" && amountInBtc > currentBtcBalance) {
      toast({ variant: "destructive", description: "Insufficient BTC balance." });
      return;
    }
    
    // Simulate sell delay
    if (type === "sell") {
        await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const result = runSimpleTradeSimulation(amountInBtc);
    
    let newUsd, newBtc;
    if (type === "buy") {
      newUsd = currentUsdBalance - amountInUsd;
      newBtc = currentBtcBalance + amountInBtc;
    } else {
      newUsd = currentUsdBalance + amountInUsd;
      newBtc = currentBtcBalance - amountInBtc;
    }

    if (newUsd === 0) {
      newUsd = 1;
    }
    
    const newDailyGain = result.gainLoss > 0 ? currentDailyGain + result.gainLoss : currentDailyGain;
    const newDailyLoss = result.gainLoss < 0 ? currentDailyLoss + Math.abs(result.gainLoss) : currentDailyLoss;

    setUsdBalance(newUsd);
    setBtcBalance(newBtc);
    setDailyGain(newDailyGain);
    setDailyLoss(newDailyLoss);
    setCurrentPrice(result.newPrice);

    if (username) {
        await set(ref(db, `users/${username}`), {
          usdBalance: newUsd,
          btcBalance: newBtc,
          dailyGain: newDailyGain,
          dailyLoss: newDailyLoss,
          lastTradeDate: new Date().toISOString().split('T')[0],
        });
    }
    
    const gainLossText = result.gainLoss >= 0 ? `gain of $${result.gainLoss.toFixed(2)}` : `loss of $${Math.abs(result.gainLoss).toFixed(2)}`;
    
    toast({
      variant: result.gainLoss >= 0 ? "default" : "destructive",
      title: `Trade Successful`,
      description: `Your ${type} order resulted in an instant ${gainLossText}.`,
    });
  };

  const portfolioValue = (usdBalance ?? 0) + (btcBalance ?? 0) * currentPrice;
  const todaysPL = dailyGain - dailyLoss;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (isModalOpen || !username) {
    return <UserModal open={isModalOpen || !username} onSave={handleUserLogin} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
            <h1 className="text-2xl font-headline font-bold text-primary">URA Trade Pro</h1>
            <div className="hidden md:flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                <span>Market:</span>
                <span className="font-bold text-foreground">{marketState}</span>
            </div>
        </div>
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
             <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
             </Button>
          </div>
        )}
      </header>
      <main className="flex-grow p-4 md:p-8 overflow-auto">
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
              {typeof usdBalance === 'number' && typeof btcBalance === 'number' ? (
                <>
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
                </>
              ) : (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
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
                    <Button onClick={form.handleSubmit(v => handleTrade(v, 'buy'))}>
                      <ArrowUp className="mr-2 h-4 w-4" />
                      Buy
                    </Button>
                    <Button onClick={form.handleSubmit(v => handleTrade(v, 'sell'))} variant="destructive">
                      <ArrowDown className="mr-2 h-4 w-4" />
                      Sell
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
