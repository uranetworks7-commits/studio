
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Bitcoin,
  ArrowRightLeft,
  Info,
  Landmark,
  Loader2,
  LogOut,
  Monitor,
  Smartphone,
  ThumbsUp,
  User,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { useViewport } from "@/context/viewport-context";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { get, ref, update } from "firebase/database";
import { PriceChart } from "./price-chart";
import { UserModal } from "./user-modal";
import { Separator } from "./ui/separator";

const formSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: "Please enter a valid number." })
    .positive({ message: "Amount must be positive." })
    .optional(),
});

type TradeFormValues = z.infer<typeof formSchema>;

const INITIAL_PRICE = 65000;
const PRICE_HISTORY_LENGTH = 400;
const CANDLESTICK_INTERVAL = 5;
const EXTREME_MODE_THRESHOLD = 1_000_000;

interface PriceData {
  time: string;
  price: number;
  ohlc?: [number, number, number, number];
}

type PriceRegimeKey = "LOW" | "MID" | "HIGH";

type PriceRegime = {
  name: string;
  range: [number, number];
  leaveProb: number;
};

const priceRegimes: Record<PriceRegimeKey, PriceRegime> = {
    LOW: {
        name: "Bearish Correction",
        range: [35000, 55000],
        leaveProb: 1.0, // 100% chance to go to MID
    },
    MID: {
        name: "Market Consolidation",
        range: [55000, 75000],
        leaveProb: 0.01, // 1% chance to leave
    },
    HIGH: {
        name: "Bull Run",
        range: [75000, 120000],
        leaveProb: 1.0, // 100% chance to go to MID
    },
};

interface UserData {
  usdBalance: number;
  btcBalance: number;
  avgBtcCost: number;
  todaysPL: number;
  lastPrice?: number;
}

function calculateTrade(
  tradeType: "buy" | "sell",
  amountInUsd: number,
  price: number,
  currentUserData: Omit<UserData, 'todaysPL'>
) {
  const { usdBalance, btcBalance, avgBtcCost } =
    currentUserData;
  let result = {
    ...currentUserData,
    tradePL: 0,
    btcAmountTraded: 0,
    saleProceeds: 0,
  };

  if (tradeType === "buy") {
    const btcAmount = amountInUsd / price;
    const costOfNewBtc = amountInUsd;
    const totalCostOfExistingBtc = btcBalance * avgBtcCost;
    const newTotalBtc = btcBalance + btcAmount;
    const newTotalCost = totalCostOfExistingBtc + costOfNewBtc;

    result.usdBalance -= costOfNewBtc;
    result.btcBalance = newTotalBtc;
    result.avgBtcCost = newTotalBtc > 0 ? newTotalCost / newTotalBtc : 0;
    result.btcAmountTraded = btcAmount;
  } else {
    // sell
    const btcToSell = amountInUsd / price;
    const proceedsFromSale = btcToSell * price;
    const costOfBtcSold = btcToSell * avgBtcCost;
    const tradePL = proceedsFromSale - costOfBtcSold;

    result.btcBalance -= btcToSell;
    result.usdBalance += proceedsFromSale; 
    result.avgBtcCost = result.btcBalance < 0.00000001 ? 0 : avgBtcCost;
    result.tradePL = tradePL;
    result.btcAmountTraded = btcToSell;
    result.saleProceeds = proceedsFromSale;
  }
  return result;
}

export default function TradingDashboard() {
  const [username, setUsername] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrading, setIsTrading] = useState(false);
  
  const [usdBalance, setUsdBalance] = useState<number>(1000);
  const [todaysPL, setTodaysPL] = useState<number>(0);

  const btcBalanceRef = useRef<number>(0); 
  const [btcBalance, _setBtcBalance] = useState<number>(0);
  const avgBtcCostRef = useRef<number>(0);
  const [avgBtcCost, _setAvgBtcCost] = useState<number>(0);
  
  const setBtcBalance = (value: number) => {
    btcBalanceRef.current = value;
    _setBtcBalance(value);
  }
  const setAvgBtcCost = (value: number) => {
    avgBtcCostRef.current = value;
    _setAvgBtcCost(value);
  }

  const form = useForm<TradeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: undefined,
    },
  });

  const [isExtremeMode, setIsExtremeMode] = useState(false);

  const [currentPrice, setCurrentPrice] = useState(INITIAL_PRICE);
  const [priceHistory, setPriceHistory] = useState<PriceData[]>([]);
  const rawPriceHistoryRef = useRef<PriceData[]>([]);
  const [chartType, setChartType] = useState<"area" | "candlestick">("area");

  const [priceRegime, setPriceRegime] = useState<PriceRegimeKey>("MID");

  const { toast } = useToast();
  const { isDesktopView, setIsDesktopView, isMobile } = useViewport();

  const priceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const regimeRef = useRef(priceRegime);

  useEffect(() => {
    regimeRef.current = priceRegime;
  }, [priceRegime]);

  const handleUserLogin = useCallback(
    async (name: string): Promise<"success" | "not_found" | "error"> => {
      try {
        const userRef = ref(db, `users/${name}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const userData: UserData = snapshot.val();
          setUsdBalance(userData.usdBalance ?? 1000);
          setBtcBalance(userData.btcBalance ?? 0);
          setAvgBtcCost(userData.avgBtcCost ?? 0);
          setTodaysPL(userData.todaysPL ?? 0);

          const lastPrice = userData.lastPrice ?? INITIAL_PRICE;
          
          let initialRegime: PriceRegimeKey = "MID";
          if (lastPrice < priceRegimes.LOW.range[1]) {
            initialRegime = "LOW";
          } else if (lastPrice > priceRegimes.HIGH.range[0]) {
            initialRegime = "HIGH";
          }
          
          setCurrentPrice(lastPrice);
          setPriceRegime(initialRegime);

          setUsername(name);
          localStorage.setItem("bitsim_username", name);
          setIsModalOpen(false);
          return "success";
        } else {
          return "not_found";
        }
      } catch (err) {
        console.error("Firebase error during login: ", err);
        toast({
          variant: "destructive",
          description: "Error connecting to the server.",
        });
        return "error";
      }
    },
    [toast]
  );

  useEffect(() => {
    const storedUsername = localStorage.getItem("bitsim_username");
    if (storedUsername) {
      handleUserLogin(storedUsername).finally(() => setIsLoading(false));
    } else {
      setIsModalOpen(true);
      setIsLoading(false);
    }
  }, [handleUserLogin]);

  useEffect(() => {
    if (!username || isLoading) return;
  
    const updatePrice = () => {
      setCurrentPrice((prevPrice) => {
        let currentRegimeKey = regimeRef.current;
        const currentRegime = priceRegimes[currentRegimeKey];
        
        // Regime Transition Logic
        if (Math.random() < currentRegime.leaveProb) {
            if (currentRegimeKey === 'LOW') {
                currentRegimeKey = 'MID';
            } else if (currentRegimeKey === 'HIGH') {
                currentRegimeKey = 'MID';
            } else { // MID
                currentRegimeKey = Math.random() < 0.5 ? 'LOW' : 'HIGH';
            }
        }
  
        if (currentRegimeKey !== regimeRef.current) {
          setPriceRegime(currentRegimeKey);
        }
        
        // --- Realistic Price Movement Logic ---
        let newPrice = prevPrice;
        let percentageChange = 0;
        const volatilityRand = Math.random();

        if (volatilityRand < 0.95) { // 95% chance for small change
            percentageChange = (Math.random() - 0.5) * 0.01; // -0.5% to +0.5%
        } else if (volatilityRand < 0.99) { // 4% chance for larger swing
            percentageChange = (Math.random() - 0.5) * 0.05; // -2.5% to +2.5%
        } else { // 1% chance for major swing (quick fall/rise)
            percentageChange = (Math.random() > 0.5 ? 1 : -1) * (0.02 + Math.random() * 0.03); // +/- 2% to 5%
        }
        
        let changeAmount = prevPrice * percentageChange;
        
        // Harder mode: downward pressure against unrealized gains
        const unrealizedPL = (prevPrice - avgBtcCostRef.current) * btcBalanceRef.current;
        if (unrealizedPL > 0 && btcBalanceRef.current > 0) {
            const difficultyFactor = Math.log1p(unrealizedPL) * 0.001; // Extremely difficult
            changeAmount -= prevPrice * difficultyFactor * Math.random();
        }
        
        newPrice += changeAmount;

        // Boundary checks to nudge price back into its regime
        const [minRange, maxRange] = priceRegimes[currentRegimeKey].range;
        if (newPrice < minRange) {
          newPrice = minRange + (minRange - newPrice) * 0.1; 
        } else if (newPrice > maxRange) {
          newPrice = maxRange - (newPrice - maxRange) * 0.1;
        }

        // Absolute floor
        return Math.max(priceRegimes.LOW.range[0] * 0.9, newPrice);
      });
  
      const nextUpdateIn = 1000 + Math.random() * 500;
  
      if (priceUpdateTimeoutRef.current) {
        clearTimeout(priceUpdateTimeoutRef.current);
      }
      priceUpdateTimeoutRef.current = setTimeout(updatePrice, nextUpdateIn);
    };
  
    updatePrice();
  
    return () => {
      if (priceUpdateTimeoutRef.current)
        clearTimeout(priceUpdateTimeoutRef.current);
    };
  }, [username, isLoading]);

  const portfolioValue = usdBalance + btcBalance * currentPrice;

  useEffect(() => {
    const mode = portfolioValue >= EXTREME_MODE_THRESHOLD;
    if (mode !== isExtremeMode) {
      setIsExtremeMode(mode);
      toast({
        title: mode ? "Extreme Mode Activated!" : "Normal Mode Restored",
        description: mode
          ? "Your portfolio is over $1M. Trading rules have changed."
          : "Your portfolio is below $1M. Standard trading rules apply.",
        variant: mode ? "destructive" : "default",
      });
    }
  }, [portfolioValue, isExtremeMode, toast]);

  useEffect(() => {
    if (!username) return;

    const newTime = new Date();
    const newEntry: PriceData = {
      time: newTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      price: currentPrice,
    };

    rawPriceHistoryRef.current = [
      ...rawPriceHistoryRef.current,
      newEntry,
    ].slice(-PRICE_HISTORY_LENGTH * CANDLESTICK_INTERVAL);

    if (chartType === "candlestick") {
      const tempHistory = rawPriceHistoryRef.current;
      const candles = [];
      let i = 0;
      while (i < tempHistory.length) {
        const chunk = tempHistory.slice(i, i + CANDLESTICK_INTERVAL);
        if (chunk.length > 0) {
          const open = chunk[0].price;
          const close = chunk[chunk.length - 1].price;
          const high = Math.max(...chunk.map((p) => p.price));
          const low = Math.min(...chunk.map((p) => p.price));
          const candleTime = chunk[0].time;

          candles.push({
            time: candleTime.substring(0, 5),
            price: close,
            ohlc: [open, high, low, close] as [number, number, number, number],
          });
        }
        i += CANDLESTICK_INTERVAL;
      }
      setPriceHistory(candles.slice(-PRICE_HISTORY_LENGTH));
    } else {
      const currentHistory = rawPriceHistoryRef.current.map((d) => ({
        ...d,
        time: d.time.substring(0, 5),
      }));
      setPriceHistory(currentHistory.slice(-PRICE_HISTORY_LENGTH));
    }

    const savePrice = async () => {
      if (username) {
        const userRef = ref(db, `users/${username}`);
        await update(userRef, { lastPrice: currentPrice });
      }
    };
    const timeoutId = setTimeout(savePrice, 1000); 
    return () => clearTimeout(timeoutId);
  }, [currentPrice, chartType, username]);

  const handleLogout = async () => {
    if (username) {
      try {
        const userRef = ref(db, `users/${username}`);
        await update(userRef, { lastPrice: currentPrice, todaysPL });
      } catch (error) {
        console.error("Failed to save data on logout", error);
      }
    }
    setUsername(null);
    setUsdBalance(0);
    setBtcBalance(0);
    setAvgBtcCost(0);
    setTodaysPL(0);
    setPriceHistory([]);
    rawPriceHistoryRef.current = [];
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
  };

  const handleTrade = async (
    values: TradeFormValues,
    type: "buy" | "sell"
  ) => {
    if (isTrading || !username || !values.amount) return;

    const { amount: amountInUsd } = values;

    setIsTrading(true);

    if (isExtremeMode) {
      if (type === "sell") {
        toast({
          variant: "destructive",
          description: "Sell option is disabled in Extreme Mode.",
        });
        setIsTrading(false);
        return;
      }

      if (amountInUsd > usdBalance) {
        toast({
          variant: "destructive",
          description: "Insufficient USD to place this bet.",
        });
        setIsTrading(false);
        return;
      }

      try {
        await new Promise((resolve) => setTimeout(resolve, 750));
        const isWin = Math.random() < 0.2;
        const payout = isWin ? amountInUsd * 1.9 : -amountInUsd;

        const newUsdBalance = usdBalance + payout;

        const updatedValues = {
          usdBalance: newUsdBalance,
        };

        const userRef = ref(db, `users/${username}`);
        await update(userRef, updatedValues);

        setUsdBalance(newUsdBalance);

        toast({
          title: isWin ? "You Won!" : "You Lost!",
          description: `You ${
            isWin ? "gained" : "lost"
          } $${Math.abs(payout).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`,
          variant: isWin ? "default" : "destructive",
        });
      } catch (err) {
        console.error("Extreme mode trade error: ", err);
        toast({
          variant: "destructive",
          description: "An error occurred during the trade simulation.",
        });
      } finally {
        setIsTrading(false);
        form.reset({ amount: values.amount });
      }
    } else {
      // NORMAL MODE LOGIC
      if (type === "buy" && amountInUsd > usdBalance) {
        toast({
          variant: "destructive",
          description: "Insufficient USD to place this trade.",
        });
        setIsTrading(false);
        return;
      }
      if (type === "sell") {
        const btcAmountEquivalent = amountInUsd / currentPrice;
        if (btcAmountEquivalent > btcBalance) {
          toast({
            variant: "destructive",
            description: `Insufficient BTC balance. You only have ${btcBalance.toFixed(
              8
            )} BTC.`,
          });
          setIsTrading(false);
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 750));

      const currentUserData = {
        usdBalance,
        btcBalance,
        avgBtcCost,
      };

      const result = calculateTrade(
        type,
        amountInUsd,
        currentPrice,
        currentUserData
      );

      try {
        if (type === "buy") {
          const updatedValues = {
            usdBalance: result.usdBalance,
            btcBalance: result.btcBalance,
            avgBtcCost: result.avgBtcCost,
          };
          const userRef = ref(db, `users/${username}`);
          await update(userRef, updatedValues);

          setUsdBalance(result.usdBalance);
          setBtcBalance(result.btcBalance);
          setAvgBtcCost(result.avgBtcCost);

          toast({
            title: `Trade Successful`,
            description: `Bought ${result.btcAmountTraded.toFixed(
              8
            )} BTC for $${amountInUsd.toFixed(2)}.`,
          });
        } else { // Sell logic
          
          const instantUpdate = {
              usdBalance: result.usdBalance,
              btcBalance: result.btcBalance,
              avgBtcCost: result.avgBtcCost,
          };
          const userRef = ref(db, `users/${username}`);
          await update(userRef, instantUpdate);
          
          setUsdBalance(result.usdBalance);
          setBtcBalance(result.btcBalance);
          setAvgBtcCost(result.avgBtcCost);

          const newPL = todaysPL + result.tradePL;
          setTodaysPL(newPL);

          toast({
            title: `Sale Confirmed`,
            description: `+$${result.saleProceeds.toFixed(2)} added to USD. P/L for this trade: $${result.tradePL.toFixed(2)}.`,
            variant: result.tradePL >= 0 ? "default" : "destructive",
          });

          setTimeout(async () => {
              const currentPL = newPL;
              const finalUsdBalance = result.usdBalance + currentPL;
              
              const finalUpdate = {
                  usdBalance: finalUsdBalance,
                  todaysPL: 0 
              };
              await update(userRef, finalUpdate);
              
              setUsdBalance(finalUsdBalance);
              setTodaysPL(0); 

              toast({
                  title: 'P/L Realized',
                  description: `$${currentPL.toFixed(2)} has been settled to your USD balance.`
              });
          }, 2000);
        }
      } catch (err) {
        console.error("Firebase error during trade: ", err);
        toast({
          variant: "destructive",
          description: "Error saving trade. Please try again.",
        });
      } finally {
        setIsTrading(false);
        form.reset({ amount: values.amount });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (isModalOpen || !username) {
    return (
      <UserModal open={isModalOpen || !username} onSave={handleUserLogin} />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-headline font-bold text-primary">
            URA Trade
          </h1>
          <div className="hidden md:flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
            <span>Market:</span>
            <span className="font-bold text-foreground">
              {priceRegimes[priceRegime].name}
            </span>
          </div>
        </div>
        {username && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{username}</span>
            </div>
            <Button variant="outline" size="icon" onClick={handleFeedback}>
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>
      <main className="flex-grow p-4 md:p-8 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          <div className="lg:col-span-2 min-h-[50vh] lg:min-h-0">
            <PriceChart
              data={priceHistory}
              currentPrice={currentPrice}
              chartType={chartType}
            />
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-headline flex items-center gap-2">
                    {isExtremeMode ? (
                      <>
                        Place Bet
                        <Zap className="h-5 w-5 text-destructive" />
                      </>
                    ) : (
                      <>
                        New Trade
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="transparent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15.5 8.5a3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 2 3 4.5 3 4.5s3-2.5 3-4.5z" fill="hsl(var(--chart-1))" stroke="white" strokeWidth="1"/>
                          <path d="M11 7.5a1 1 0 0 1 1-1" stroke="white" strokeWidth="0.5" strokeLinecap="round"/>
                        </svg>
                      </>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {isExtremeMode
                      ? "Enter Heavy Ammount."
                      : "Buy or sell Bitcoin."}
                  </CardDescription>
                </div>
                {isMobile && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsDesktopView(!isDesktopView)}
                  >
                    {isDesktopView ? <Smartphone /> : <Monitor />}
                  </Button>
                )}
              </CardHeader>
              <Form {...form}>
                <form onSubmit={(e) => e.preventDefault()}>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {isExtremeMode
                              ? "Bet Amount (USD)"
                              : "Amount (USD)"}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="100.00"
                              {...field}
                              type="number"
                              step="0.01"
                              disabled={isTrading}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value === "" ? undefined : Number(value));
                              }}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {!isExtremeMode && (
                      <FormItem>
                        <FormLabel>Chart Type</FormLabel>
                        <Select
                          onValueChange={(value: "area" | "candlestick") =>
                            setChartType(value)
                          }
                          defaultValue={chartType}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select chart type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="area">Area</SelectItem>
                            <SelectItem value="candlestick">
                              Candlestick
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  </CardContent>
                  <CardFooter className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={form.handleSubmit((v) => handleTrade(v, "buy"))}
                      disabled={isTrading}
                    >
                      {isTrading && !isExtremeMode ? (
                        <Loader2 className="animate-spin mr-2" />
                      ) : (
                        <ArrowUp />
                      )}
                      {isExtremeMode
                        ? isTrading
                          ? "Placing Bet..."
                          : "Place Bet"
                        : isTrading
                        ? "Buying..."
                        : "Buy"}
                    </Button>
                    <Button
                      onClick={form.handleSubmit((v) => handleTrade(v, "sell"))}
                      variant="destructive"
                      disabled={isTrading || isExtremeMode}
                    >
                      {isTrading ? (
                        <Loader2 className="animate-spin mr-2" />
                      ) : (
                        <ArrowDown />
                      )}
                      {isTrading ? "Selling..." : "Sell"}
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1.5">
                  <CardTitle className="font-headline">Portfolio</CardTitle>
                  <CardDescription>
                    Your current assets and total value.
                  </CardDescription>
                </div>
                <Link href="/about" passHref>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Info className="h-4 w-4" />
                    <span className="sr-only">About</span>
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {typeof usdBalance === "number" &&
                typeof btcBalance === "number" ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Value</span>
                      <span className="text-2xl font-bold font-headline">
                        $
                        {portfolioValue.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        <span>USD Balance</span>
                      </div>
                      <span>
                        $
                        {usdBalance.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bitcoin className="h-5 w-5 text-primary" />
                        <span>BTC Balance</span>
                      </div>
                      <span>{btcBalance.toFixed(8)}</span>
                    </div>
                    {!isExtremeMode && (
                        <>
                        <Separator />
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <ArrowRightLeft className="h-4 w-4" />
                                <span>Today's P/L</span>
                            </div>
                            <span className={todaysPL >= 0 ? 'text-green-500' : 'text-red-500'}>
                                ${todaysPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        </>
                    )}
                  </>
                ) : (
                  <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
