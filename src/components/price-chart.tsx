"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

interface PriceData { 
    time: string; 
    price: number;
    ohlc?: [number, number, number, number]; // open, high, low, close
}
interface PriceChartProps {
  data: PriceData[];
  currentPrice: number;
  chartType: 'area' | 'candlestick';
}

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
  ohlc: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  }
} satisfies ChartConfig;

export function PriceChart({ data, currentPrice, chartType }: PriceChartProps) {
    const isPositiveChange = data.length > 1 ? currentPrice >= data[data.length - 2].price : true;

    const renderTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            if (chartType === 'candlestick' && payload[0].payload.ohlc) {
                const [open, high, low, close] = payload[0].payload.ohlc;
                return (
                    <div className="p-2 text-sm bg-card border rounded-lg shadow-lg">
                        <p className="font-bold text-foreground">{`Time: ${label}`}</p>
                        <p>Open: ${open.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        <p>High: ${high.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        <p>Low: ${low.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        <p>Close: ${close.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    </div>
                );
            }
            return (
            <div className="p-2 text-sm bg-card border rounded-lg shadow-lg">
                <p className="font-bold text-foreground">{`Price: $${payload[0].value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}</p>
                <p className="text-muted-foreground">{`Time: ${label}`}</p>
            </div>
            );
        }
        return null;
    };

    const CustomBar = (props: any) => {
        const { x, y, width, height, payload } = props;
        const [open, high, low, close] = payload.ohlc;
        const isPositive = close >= open;
        const color = isPositive ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-2))';
      
        return (
          <g>
            <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={color} />
            <rect x={x} y={isPositive ? y + (height * (1-((close-low)/(high-low)))) : y} width={width} height={Math.abs(open - close) / (high - low) * height || 1} fill={color} />
          </g>
        );
      };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="font-headline">Bitcoin Price</CardTitle>
        <CardDescription>Live simulated price data</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <ChartContainer config={chartConfig} className="h-full w-full">
            {chartType === 'area' ? (
                <AreaChart
                    data={data}
                    margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isPositiveChange ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))"} stopOpacity={0.8}/>
                            <stop offset="95%" stopColor={isPositiveChange ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))"} stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <XAxis 
                        dataKey="time" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis 
                        domain={['dataMin - dataMin * 0.01', 'dataMax + dataMax * 0.01']} 
                        tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                        tickLine={false}
                        axisLine={false}
                        orientation="right"
                        width={80}
                    />
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                    <Tooltip content={renderTooltip} cursor={{stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3'}} />
                    <Area
                    type="monotone"
                    dataKey="price"
                    stroke={isPositiveChange ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))"}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPrice)"
                    />
                </AreaChart>
            ) : (
                <BarChart
                    data={data}
                    margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                    <XAxis 
                        dataKey="time" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis 
                        domain={['dataMin - dataMin * 0.02', 'dataMax + dataMax * 0.02']} 
                        tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                        tickLine={false}
                        axisLine={false}
                        orientation="right"
                        width={80}
                    />
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                    <Tooltip content={renderTooltip} cursor={{stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3'}} />
                    <Bar
                        dataKey="ohlc"
                        shape={<CustomBar />}
                    />
                </BarChart>
            )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
