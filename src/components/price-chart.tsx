"use client";

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
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

interface PriceChartProps {
  data: { time: string; price: number }[];
  currentPrice: number;
}

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export function PriceChart({ data, currentPrice }: PriceChartProps) {
    const isPositiveChange = data.length > 1 ? currentPrice >= data[data.length - 2].price : true;

    const renderTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
            <div className="p-2 text-sm bg-card border rounded-lg shadow-lg">
                <p className="font-bold text-foreground">{`Price: $${payload[0].value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}</p>
                <p className="text-muted-foreground">{`Time: ${label}`}</p>
            </div>
            );
        }
        return null;
    };


  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="font-headline">Bitcoin Price</CardTitle>
        <CardDescription>Live simulated price data</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <ChartContainer config={chartConfig} className="h-full w-full">
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
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
