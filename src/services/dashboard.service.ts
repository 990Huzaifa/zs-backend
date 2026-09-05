import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardQueryDto } from '../auth/dto/dashboard.dto';
import { Trip, TripStatus } from '../database/entities/trip.entity';

type TrendDirection = 'up' | 'down' | 'neutral';

type StatusCounts = Record<TripStatus, number>;

const STATUS_ORDER: TripStatus[] = [
  TripStatus.PENDING,
  TripStatus.STARTED,
  TripStatus.IN_TRANSIT,
  TripStatus.COMPLETED,
  TripStatus.CANCELLED,
];

const STATUS_LABELS: Record<TripStatus, string> = {
  [TripStatus.PENDING]: 'Pending',
  [TripStatus.STARTED]: 'In Progress',
  [TripStatus.IN_TRANSIT]: 'In Transit',
  [TripStatus.COMPLETED]: 'Completed',
  [TripStatus.CANCELLED]: 'Cancelled',
};

const STATUS_COLORS: Record<TripStatus, string> = {
  [TripStatus.PENDING]: '#F59E0B',
  [TripStatus.STARTED]: '#3B82F6',
  [TripStatus.IN_TRANSIT]: '#8B5CF6',
  [TripStatus.COMPLETED]: '#84CC16',
  [TripStatus.CANCELLED]: '#D1D5DB',
};

const SUMMARY_CARDS = [
  {
    key: 'total',
    title: 'Total Trips',
    iconType: 'document',
    colorTheme: 'green',
  },
  {
    key: 'completed',
    title: 'Completed Trips',
    status: TripStatus.COMPLETED,
    iconType: 'check',
    colorTheme: 'green',
  },
  {
    key: 'started',
    title: 'In Progress Trips',
    status: TripStatus.STARTED,
    iconType: 'clock',
    colorTheme: 'blue',
  },
  {
    key: 'pending',
    title: 'Pending Trips',
    status: TripStatus.PENDING,
    iconType: 'pending',
    colorTheme: 'amber',
  },
] as const;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
  ) {}

  async getDashboard(query: DashboardQueryDto) {
    const { startDate, endDate } = this.resolveDateRange(query);
    const rangeDays = this.daysBetween(startDate, endDate);
    const previousEndDate = this.addDays(startDate, -1);
    const previousStartDate = this.addDays(previousEndDate, -(rangeDays - 1));

    const [currentCounts, previousCounts, dailyRows] = await Promise.all([
      this.countTripsByStatus(startDate, endDate),
      this.countTripsByStatus(previousStartDate, previousEndDate),
      this.getDailyStatusCounts(startDate, endDate),
    ]);

    return {
      tripSummary: this.buildTripSummary(currentCounts, previousCounts),
      tripGraph: this.buildTripGraph(startDate, endDate, dailyRows),
      tripChart: this.buildTripChart(currentCounts),
    };
  }

  private buildTripSummary(
    current: StatusCounts & { total: number },
    previous: StatusCounts & { total: number },
  ) {
    const trendLabel = 'from last week';

    const cards = SUMMARY_CARDS.map((card) => {
      const currentValue =
        card.key === 'total' ? current.total : current[card.status!];
      const previousValue =
        card.key === 'total' ? previous.total : previous[card.status!];
      const trend = this.calcTrend(currentValue, previousValue);

      return {
        key: card.key,
        title: card.title,
        value: currentValue,
        iconType: card.iconType,
        colorTheme: card.colorTheme,
        trend: {
          percentage: trend.percentage,
          direction: trend.direction,
          label: trendLabel,
        },
      };
    });

    return { cards };
  }

  private buildTripGraph(
    startDate: string,
    endDate: string,
    dailyRows: Array<{
      date: string;
      status: TripStatus;
      count: number;
    }>,
  ) {
    const dates = this.enumerateDates(startDate, endDate);
    const dailyMap = new Map<string, StatusCounts>();

    for (const date of dates) {
      dailyMap.set(date, this.emptyStatusCounts());
    }

    for (const row of dailyRows) {
      const bucket = dailyMap.get(row.date);
      if (bucket) {
        bucket[row.status] = row.count;
      }
    }

    return {
      startDate,
      endDate,
      labels: dates.map((date) => this.formatChartLabel(date)),
      dates,
      series: STATUS_ORDER.map((status) => ({
        status,
        label: STATUS_LABELS[status],
        color: STATUS_COLORS[status],
        data: dates.map((date) => dailyMap.get(date)?.[status] ?? 0),
      })),
    };
  }

  private buildTripChart(counts: StatusCounts & { total: number }) {
    const total = counts.total;

    return {
      total,
      items: STATUS_ORDER.map((status) => {
        const count = counts[status];
        const percentage =
          total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

        return {
          status,
          label: STATUS_LABELS[status],
          count,
          percentage,
          color: STATUS_COLORS[status],
        };
      }),
    };
  }

  private resolveDateRange(query: DashboardQueryDto) {
    const endDate = query.endDate?.slice(0, 10) ?? this.todayDateString();
    const startDate =
      query.startDate?.slice(0, 10) ?? this.addDays(endDate, -6);

    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    return { startDate, endDate };
  }

  private async countTripsByStatus(startDate: string, endDate: string) {
    const byStatus = this.emptyStatusCounts();

    const rows = await this.tripRepo
      .createQueryBuilder('trip')
      .select('trip.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('trip.tripDate >= :startDate', { startDate })
      .andWhere('trip.tripDate <= :endDate', { endDate })
      .groupBy('trip.status')
      .getRawMany<{ status: TripStatus; count: string }>();

    for (const row of rows) {
      byStatus[row.status] = Number(row.count) || 0;
    }

    const total = STATUS_ORDER.reduce((sum, status) => sum + byStatus[status], 0);
    return { ...byStatus, total };
  }

  private async getDailyStatusCounts(startDate: string, endDate: string) {
    const rows = await this.tripRepo
      .createQueryBuilder('trip')
      .select('trip.tripDate', 'date')
      .addSelect('trip.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('trip.tripDate >= :startDate', { startDate })
      .andWhere('trip.tripDate <= :endDate', { endDate })
      .groupBy('trip.tripDate')
      .addGroupBy('trip.status')
      .orderBy('trip.tripDate', 'ASC')
      .getRawMany<{ date: string | Date; status: TripStatus; count: string }>();

    return rows.map((row) => ({
      date: this.normalizeDateValue(row.date),
      status: row.status,
      count: Number(row.count) || 0,
    }));
  }

  private calcTrend(
    current: number,
    previous: number,
  ): { percentage: number; direction: TrendDirection } {
    if (previous === 0) {
      if (current === 0) {
        return { percentage: 0, direction: 'neutral' };
      }
      return { percentage: 100, direction: 'up' };
    }

    const change = ((current - previous) / previous) * 100;
    const percentage = Math.round(Math.abs(change) * 10) / 10;

    if (change > 0) {
      return { percentage, direction: 'up' };
    }
    if (change < 0) {
      return { percentage, direction: 'down' };
    }
    return { percentage: 0, direction: 'neutral' };
  }

  private emptyStatusCounts(): StatusCounts {
    return {
      [TripStatus.PENDING]: 0,
      [TripStatus.STARTED]: 0,
      [TripStatus.IN_TRANSIT]: 0,
      [TripStatus.COMPLETED]: 0,
      [TripStatus.CANCELLED]: 0,
    };
  }

  private todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeDateValue(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
  }

  private parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private addDays(dateStr: string, days: number): string {
    const date = this.parseDate(dateStr);
    date.setUTCDate(date.getUTCDate() + days);
    return this.toDateString(date);
  }

  private daysBetween(startDate: string, endDate: string): number {
    const start = this.parseDate(startDate).getTime();
    const end = this.parseDate(endDate).getTime();
    return Math.round((end - start) / 86400000) + 1;
  }

  private enumerateDates(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    let current = startDate;

    while (current <= endDate) {
      dates.push(current);
      current = this.addDays(current, 1);
    }

    return dates;
  }

  private formatChartLabel(dateStr: string): string {
    const date = this.parseDate(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
}
