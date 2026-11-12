import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DashboardQueryDto,
  RevenueOverviewPeriod,
  RevenueOverviewQueryDto,
} from '../auth/dto/dashboard.dto';
import {
  Alert,
  AlertStatus,
  AlertType,
} from '../database/entities/alert.entity';
import { NotificationSeverity } from '../database/entities/notification.entity';
import { Shop } from '../database/entities/shop.entity';
import { Transaction } from '../database/entities/transaction.entity';
import {
  Trip,
  TripLoadStatus,
  TripStatus,
} from '../database/entities/trip.entity';
import {
  DeliveryChallan,
  DeliveryChallanStatus,
} from '../database/entities/warehousing/delivery-challan.entity';
import {
  InventoryLog,
  LogType,
  StockBalance,
} from '../database/entities/warehousing/inventory.entity';
import { Warehouse } from '../database/entities/warehousing/warehouse.entity';

type TrendDirection = 'up' | 'down' | 'neutral';

/** COA Income root — level1 = 4 (REVENUE). */
const COA_REVENUE_LEVEL1 = 4;

type StatusCounts = Record<TripStatus, number>;

const STATUS_ORDER: TripStatus[] = [
  TripStatus.PENDING,
  TripStatus.IN_TRANSIT,
  TripStatus.COMPLETED,
  TripStatus.CANCELLED,
];

const STATUS_LABELS: Record<TripStatus, string> = {
  [TripStatus.PENDING]: 'Pending',
  [TripStatus.IN_TRANSIT]: 'In Transit',
  [TripStatus.COMPLETED]: 'Completed',
  [TripStatus.CANCELLED]: 'Cancelled',
};

const STATUS_COLORS: Record<TripStatus, string> = {
  [TripStatus.PENDING]: '#F59E0B',
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
    key: 'in_transit',
    title: 'In Transit Trips',
    status: TripStatus.IN_TRANSIT,
    iconType: 'truck',
    colorTheme: 'purple',
  },
  {
    key: 'pending',
    title: 'Pending Trips',
    status: TripStatus.PENDING,
    iconType: 'pending',
    colorTheme: 'amber',
  },
] as const;

const ACTIVE_ALERT_STATUSES = [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED];

const DOCUMENT_EXPIRY_BREAKDOWN = [
  { key: 'critical', label: 'Critical', color: '#EF4444' },
  { key: 'warning', label: 'Warning', color: '#F59E0B' },
  { key: 'overdue', label: 'Overdue', color: '#F87171' },
] as const;

const WAREHOUSE_SUMMARY_CARDS = [
  {
    key: 'primary_wh',
    title: 'Primary WH',
    iconType: 'warehouse',
    colorTheme: 'green',
  },
  {
    key: 'secondary_wh',
    title: 'Secondary WH',
    iconType: 'warehouse',
    colorTheme: 'green',
  },
  {
    key: 'total_shops',
    title: 'Total Shops',
    iconType: 'shop',
    colorTheme: 'green',
  },
  {
    key: 'total_stock',
    title: 'Total Stock',
    iconType: 'stock',
    colorTheme: 'green',
  },
] as const;

const WAREHOUSE_OPERATION_CARDS = [
  {
    key: 'todays_inbound',
    title: "Today's Inbound",
    iconType: 'inbound',
    colorTheme: 'green',
  },
  {
    key: 'todays_outbound',
    title: "Today's Outbound",
    iconType: 'outbound',
    colorTheme: 'blue',
  },
  {
    key: 'pending_challans',
    title: 'Pending Challans',
    iconType: 'pending',
    colorTheme: 'amber',
  },
  {
    key: 'in_transit',
    title: 'In Transit',
    iconType: 'truck',
    colorTheme: 'purple',
  },
] as const;

const INBOUND_OUTBOUND_COLORS = {
  inbound: '#84CC16',
  outbound: '#1E3A5F',
} as const;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(StockBalance)
    private readonly stockBalanceRepo: Repository<StockBalance>,
    @InjectRepository(InventoryLog)
    private readonly inventoryLogRepo: Repository<InventoryLog>,
    @InjectRepository(DeliveryChallan)
    private readonly deliveryChallanRepo: Repository<DeliveryChallan>,
  ) {}

  async getDashboard(query: DashboardQueryDto) {
    // Date filter is ONLY for graphs (trips + inbound/outbound).
    const { startDate, endDate } = this.resolveDateRange(query);

    // Card trends always compare last 7 days vs previous 7 days (not the graph filter).
    const trendEndDate = this.todayDateString();
    const trendStartDate = this.addDays(trendEndDate, -6);
    const previousEndDate = this.addDays(trendStartDate, -1);
    const previousStartDate = this.addDays(previousEndDate, -6);

    const revenuePeriod =
      query.revenuePeriod ?? RevenueOverviewPeriod.THIS_MONTH;

    const [
      allTimeCounts,
      trendCurrentCounts,
      trendPreviousCounts,
      dailyRows,
      revenueOverview,
      documentExpiryAlerts,
      warehouseKpis,
      warehouseOps,
      inboundOutboundDaily,
      stockBySecondaryWh,
    ] = await Promise.all([
      this.countAllTripsByStatus(),
      this.countTripsByStatusInRange(trendStartDate, trendEndDate),
      this.countTripsByStatusInRange(previousStartDate, previousEndDate),
      this.getDailyStatusCounts(startDate, endDate),
      this.getRevenueOverview({ period: revenuePeriod }),
      this.getDocumentExpiryAlerts(),
      this.getWarehouseKpis(),
      this.getWarehouseOperations(trendEndDate),
      this.getDailyInboundOutbound(startDate, endDate),
      this.getStockBySecondaryWh(),
    ]);

    return {
      // Cards + chart: all-time values from DB (no date filter)
      tripSummary: this.buildTripSummary(
        allTimeCounts,
        trendCurrentCounts,
        trendPreviousCounts,
      ),
      tripChart: this.buildTripChart(allTimeCounts),
      // Graph only: respects startDate/endDate
      tripGraph: this.buildTripGraph(startDate, endDate, dailyRows),
      // Revenue Overview card — COA level1 = 4 (Income)
      revenueOverview,
      // Document Expiry Alerts card
      documentExpiryAlerts,
      // Warehousing cards + analytics
      warehouseSummary: this.buildWarehouseSummary(warehouseKpis),
      warehouseOperations: this.buildWarehouseOperations(warehouseOps),
      inboundOutboundGraph: this.buildInboundOutboundGraph(
        startDate,
        endDate,
        inboundOutboundDaily,
      ),
      stockBySecondaryWh,
    };
  }

  /**
   * Document Expiry Alerts card — active DOCUMENT_EXPIRY alerts.
   * Breakdown buckets are mutually exclusive and sum to `value`:
   * overdue | critical (not overdue) | warning (not overdue).
   */
  async getDocumentExpiryAlerts() {
    const today = this.todayDateString();
    const weekStart = this.addDays(today, -6);

    const activeAlerts = await this.alertRepo.find({
      where: {
        type: AlertType.DOCUMENT_EXPIRY,
        status: In(ACTIVE_ALERT_STATUSES),
      },
      select: ['id', 'severity', 'dueAt', 'createdAt'],
    });

    let overdue = 0;
    let critical = 0;
    let warning = 0;
    let newThisWeek = 0;

    for (const alert of activeAlerts) {
      const dueAt = this.normalizeDateValue(alert.dueAt);
      const createdAt = this.normalizeDateValue(alert.createdAt);

      if (createdAt >= weekStart) {
        newThisWeek += 1;
      }

      if (dueAt < today) {
        overdue += 1;
      } else if (alert.severity === NotificationSeverity.CRITICAL) {
        critical += 1;
      } else {
        warning += 1;
      }
    }

    const total = activeAlerts.length;
    const counts: Record<string, number> = {
      critical,
      warning,
      overdue,
    };

    return {
      key: 'document_expiry',
      title: 'Document Expiry Alerts',
      iconType: 'document',
      colorTheme: 'red',
      value: total,
      trend: {
        count: newThisWeek,
        direction: (newThisWeek > 0 ? 'up' : 'neutral') as TrendDirection,
        label: 'from last week',
      },
      breakdown: DOCUMENT_EXPIRY_BREAKDOWN.map((item) => ({
        key: item.key,
        label: item.label,
        count: counts[item.key] ?? 0,
        color: item.color,
      })),
    };
  }

  /**
   * Revenue Overview card: sum of net activity on all REVENUE (COA level1 = 4)
   * accounts for the selected calendar period vs the prior month.
   *
   * Net = SUM(credit − debit) — revenue is credit-normal.
   */
  async getRevenueOverview(query: RevenueOverviewQueryDto) {
    const period = query.period ?? RevenueOverviewPeriod.THIS_MONTH;
    const ranges = this.resolveRevenuePeriodRanges(period);

    const [currentTotal, previousTotal] = await Promise.all([
      this.sumRevenueInRange(ranges.current.startDate, ranges.current.endDate),
      this.sumRevenueInRange(
        ranges.previous.startDate,
        ranges.previous.endDate,
      ),
    ]);

    const trend = this.calcTrend(currentTotal, previousTotal);

    return {
      period,
      currency: 'PKR',
      current: {
        label: ranges.current.label,
        startDate: ranges.current.startDate,
        endDate: ranges.current.endDate,
        total: currentTotal,
      },
      previous: {
        label: ranges.previous.label,
        startDate: ranges.previous.startDate,
        endDate: ranges.previous.endDate,
        total: previousTotal,
      },
      growth: {
        percentage: trend.percentage,
        direction: trend.direction,
        label: ranges.growthLabel,
      },
    };
  }

  /**
   * Row 1 KPIs:
   * - Primary WH = warehouses count
   * - Secondary WH = distinct shops holding stock
   * - Total Shops = shops count
   * - Total Stock = sum of available cartons
   */
  private async getWarehouseKpis() {
    const [primaryWh, secondaryWhRaw, totalShops, totalStockRaw] =
      await Promise.all([
        this.warehouseRepo.count(),
        this.stockBalanceRepo
          .createQueryBuilder('stock')
          .select('COUNT(DISTINCT stock.shopId)', 'count')
          .where('stock.shopId IS NOT NULL')
          .getRawOne<{ count: string | number }>(),
        this.shopRepo.count(),
        this.stockBalanceRepo
          .createQueryBuilder('stock')
          .select('COALESCE(SUM(stock.avaiableCartons), 0)', 'total')
          .getRawOne<{ total: string | number }>(),
      ]);

    return {
      primaryWh,
      secondaryWh: Number(secondaryWhRaw?.count) || 0,
      totalShops,
      totalStock: Number(totalStockRaw?.total) || 0,
    };
  }

  /**
   * Row 2 ops:
   * - Today's Inbound = INVENTORY_IN cartons created today
   * - Today's Outbound = non-cancelled challan cartons dated today
   * - Pending Challans = PENDING status count
   * - In Transit = APPROVED challans (dispatched, not completed)
   */
  private async getWarehouseOperations(today: string) {
    const tomorrow = this.addDays(today, 1);

    const [inboundRaw, outboundRaw, pendingChallans, inTransit] =
      await Promise.all([
        this.inventoryLogRepo
          .createQueryBuilder('log')
          .select('COALESCE(SUM(log.noOfCartons), 0)', 'total')
          .where('log.logType = :logType', {
            logType: LogType.INVENTORY_IN,
          })
          .andWhere('log.createdAt >= :today', { today })
          .andWhere('log.createdAt < :tomorrow', { tomorrow })
          .getRawOne<{ total: string | number }>(),
        this.deliveryChallanRepo
          .createQueryBuilder('challan')
          .select('COALESCE(SUM(challan.totalCartons), 0)', 'total')
          .where('challan.status != :cancelled', {
            cancelled: DeliveryChallanStatus.CANCELLED,
          })
          .andWhere('challan.challanDateTime >= :today', { today })
          .andWhere('challan.challanDateTime < :tomorrow', { tomorrow })
          .getRawOne<{ total: string | number }>(),
        this.deliveryChallanRepo.count({
          where: { status: DeliveryChallanStatus.PENDING },
        }),
        this.deliveryChallanRepo.count({
          where: { status: DeliveryChallanStatus.APPROVED },
        }),
      ]);

    return {
      todaysInbound: Number(inboundRaw?.total) || 0,
      todaysOutbound: Number(outboundRaw?.total) || 0,
      pendingChallans,
      inTransit,
    };
  }

  private async getDailyInboundOutbound(startDate: string, endDate: string) {
    const endExclusive = this.addDays(endDate, 1);

    const [inboundRows, outboundRows] = await Promise.all([
      this.inventoryLogRepo
        .createQueryBuilder('log')
        .select(`TO_CHAR(log.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, 'date')
        .addSelect('COALESCE(SUM(log.noOfCartons), 0)', 'total')
        .where('log.logType = :logType', { logType: LogType.INVENTORY_IN })
        .andWhere('log.createdAt >= :startDate', { startDate })
        .andWhere('log.createdAt < :endExclusive', { endExclusive })
        .groupBy(`TO_CHAR(log.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
        .orderBy('date', 'ASC')
        .getRawMany<{ date: string; total: string }>(),
      this.deliveryChallanRepo
        .createQueryBuilder('challan')
        .select(
          `TO_CHAR(challan.challanDateTime AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
          'date',
        )
        .addSelect('COALESCE(SUM(challan.totalCartons), 0)', 'total')
        .where('challan.status != :cancelled', {
          cancelled: DeliveryChallanStatus.CANCELLED,
        })
        .andWhere('challan.challanDateTime >= :startDate', { startDate })
        .andWhere('challan.challanDateTime < :endExclusive', {
          endExclusive,
        })
        .groupBy(
          `TO_CHAR(challan.challanDateTime AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        )
        .orderBy('date', 'ASC')
        .getRawMany<{ date: string; total: string }>(),
    ]);

    return {
      inbound: inboundRows.map((row) => ({
        date: this.normalizeDateValue(row.date),
        total: Number(row.total) || 0,
      })),
      outbound: outboundRows.map((row) => ({
        date: this.normalizeDateValue(row.date),
        total: Number(row.total) || 0,
      })),
    };
  }

  /**
   * Progress list: shop stock balances as secondary WH points.
   * Percentage is share of total secondary (shop) stock.
   */
  private async getStockBySecondaryWh() {
    const rows = await this.stockBalanceRepo
      .createQueryBuilder('stock')
      .leftJoinAndSelect('stock.shop', 'shop')
      .where('stock.shopId IS NOT NULL')
      .andWhere('stock.avaiableCartons > 0')
      .orderBy('stock.avaiableCartons', 'DESC')
      .addOrderBy('shop.shopName', 'ASC')
      .getMany();

    const total = rows.reduce(
      (sum, row) => sum + (row.avaiableCartons || 0),
      0,
    );

    const items = rows.map((row) => {
      const stock = row.avaiableCartons || 0;
      const percentage =
        total === 0 ? 0 : Math.round((stock / total) * 1000) / 10;
      const code =
        row.shop?.shopCode?.trim() ||
        row.shop?.branchCode?.trim() ||
        null;

      return {
        id: row.shopId,
        code,
        name: row.shop?.shopName ?? null,
        stock,
        percentage,
      };
    });

    return {
      key: 'stock_by_secondary_wh',
      title: 'Stock by Secondary WH',
      total,
      items,
    };
  }

  private buildWarehouseSummary(kpis: {
    primaryWh: number;
    secondaryWh: number;
    totalShops: number;
    totalStock: number;
  }) {
    const values: Record<string, number> = {
      primary_wh: kpis.primaryWh,
      secondary_wh: kpis.secondaryWh,
      total_shops: kpis.totalShops,
      total_stock: kpis.totalStock,
    };

    return {
      cards: WAREHOUSE_SUMMARY_CARDS.map((card) => ({
        key: card.key,
        title: card.title,
        value: values[card.key] ?? 0,
        iconType: card.iconType,
        colorTheme: card.colorTheme,
      })),
    };
  }

  private buildWarehouseOperations(ops: {
    todaysInbound: number;
    todaysOutbound: number;
    pendingChallans: number;
    inTransit: number;
  }) {
    const values: Record<string, number> = {
      todays_inbound: ops.todaysInbound,
      todays_outbound: ops.todaysOutbound,
      pending_challans: ops.pendingChallans,
      in_transit: ops.inTransit,
    };

    return {
      cards: WAREHOUSE_OPERATION_CARDS.map((card) => ({
        key: card.key,
        title: card.title,
        value: values[card.key] ?? 0,
        iconType: card.iconType,
        colorTheme: card.colorTheme,
      })),
    };
  }

  private buildInboundOutboundGraph(
    startDate: string,
    endDate: string,
    daily: {
      inbound: Array<{ date: string; total: number }>;
      outbound: Array<{ date: string; total: number }>;
    },
  ) {
    const dates = this.enumerateDates(startDate, endDate);
    const inboundMap = new Map(
      daily.inbound.map((row) => [row.date, row.total]),
    );
    const outboundMap = new Map(
      daily.outbound.map((row) => [row.date, row.total]),
    );

    return {
      startDate,
      endDate,
      labels: dates.map((date) => this.formatChartLabel(date)),
      dates,
      series: [
        {
          key: 'inbound',
          label: 'Inbound',
          color: INBOUND_OUTBOUND_COLORS.inbound,
          data: dates.map((date) => inboundMap.get(date) ?? 0),
        },
        {
          key: 'outbound',
          label: 'Outbound',
          color: INBOUND_OUTBOUND_COLORS.outbound,
          data: dates.map((date) => outboundMap.get(date) ?? 0),
        },
      ],
    };
  }

  private buildTripSummary(
    allTime: StatusCounts & { total: number },
    trendCurrent: StatusCounts & { total: number },
    trendPrevious: StatusCounts & { total: number },
  ) {
    const trendLabel = 'from last week';

    const cards = SUMMARY_CARDS.map((card) => {
      // Card values are always all-time (no date filter).
      const value =
        card.key === 'total' ? allTime.total : allTime[card.status!];

      const currentTrendValue =
        card.key === 'total'
          ? trendCurrent.total
          : trendCurrent[card.status!];
      const previousTrendValue =
        card.key === 'total'
          ? trendPrevious.total
          : trendPrevious[card.status!];
      const trend = this.calcTrend(currentTrendValue, previousTrendValue);

      return {
        key: card.key,
        title: card.title,
        value,
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

  /**
   * Trip units for dashboard:
   * - UC load side present → +1
   * - DC load side present → +1
   * So a trip with both UC and DC counts as 2. CANCELLED loads are ignored.
   */
  private async countAllTripsByStatus() {
    return this.countLoadSideUnitsByStatus();
  }

  /** Status counts for a date range (used only for card trends). */
  private async countTripsByStatusInRange(startDate: string, endDate: string) {
    return this.countLoadSideUnitsByStatus(startDate, endDate);
  }

  private async getDailyStatusCounts(startDate: string, endDate: string) {
    const rows = await this.tripRepo
      .createQueryBuilder('trip')
      .select('trip.tripDate', 'date')
      .addSelect('trip.status', 'status')
      .addSelect(
        `SUM(
          CASE WHEN EXISTS (
            SELECT 1 FROM trip_upcountry_loads ul
            WHERE ul."tripId" = trip.id
              AND ul.status::text <> :cancelledLoad
          ) THEN 1 ELSE 0 END
          +
          CASE WHEN EXISTS (
            SELECT 1 FROM trip_downcountry_loads dl
            WHERE dl."tripId" = trip.id
              AND dl.status::text <> :cancelledLoad
          ) THEN 1 ELSE 0 END
        )`,
        'count',
      )
      .where('trip.tripDate >= :startDate', { startDate })
      .andWhere('trip.tripDate <= :endDate', { endDate })
      .setParameter('cancelledLoad', TripLoadStatus.CANCELLED)
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

  private async countLoadSideUnitsByStatus(
    startDate?: string,
    endDate?: string,
  ) {
    const byStatus = this.emptyStatusCounts();

    const qb = this.tripRepo
      .createQueryBuilder('trip')
      .select('trip.status', 'status')
      .addSelect(
        `SUM(
          CASE WHEN EXISTS (
            SELECT 1 FROM trip_upcountry_loads ul
            WHERE ul."tripId" = trip.id
              AND ul.status::text <> :cancelledLoad
          ) THEN 1 ELSE 0 END
          +
          CASE WHEN EXISTS (
            SELECT 1 FROM trip_downcountry_loads dl
            WHERE dl."tripId" = trip.id
              AND dl.status::text <> :cancelledLoad
          ) THEN 1 ELSE 0 END
        )`,
        'count',
      )
      .setParameter('cancelledLoad', TripLoadStatus.CANCELLED)
      .groupBy('trip.status');

    if (startDate) {
      qb.andWhere('trip.tripDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('trip.tripDate <= :endDate', { endDate });
    }

    const rows = await qb.getRawMany<{ status: TripStatus; count: string }>();

    for (const row of rows) {
      if (row.status in byStatus) {
        byStatus[row.status] = Number(row.count) || 0;
      }
    }

    const total = STATUS_ORDER.reduce(
      (sum, status) => sum + byStatus[status],
      0,
    );
    return { ...byStatus, total };
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

  private resolveRevenuePeriodRanges(period: RevenueOverviewPeriod) {
    const today = this.todayDateString();
    const [year, month] = today.split('-').map(Number);

    if (period === RevenueOverviewPeriod.THIS_MONTH) {
      const currentStart = this.toDateString(new Date(Date.UTC(year, month - 1, 1)));
      const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const previousStart = this.toDateString(previousMonthDate);
      const previousEnd = this.toDateString(
        new Date(Date.UTC(year, month - 1, 0)),
      );

      return {
        current: {
          label: 'This Month',
          startDate: currentStart,
          endDate: today,
        },
        previous: {
          label: 'Previous Month',
          startDate: previousStart,
          endDate: previousEnd,
        },
        growthLabel: 'from last month',
      };
    }

    // last_month: full previous calendar month vs the month before that
    const lastMonthStartDate = new Date(Date.UTC(year, month - 2, 1));
    const lastMonthEndDate = new Date(Date.UTC(year, month - 1, 0));
    const priorMonthStartDate = new Date(Date.UTC(year, month - 3, 1));
    const priorMonthEndDate = new Date(Date.UTC(year, month - 2, 0));

    return {
      current: {
        label: 'Last Month',
        startDate: this.toDateString(lastMonthStartDate),
        endDate: this.toDateString(lastMonthEndDate),
      },
      previous: {
        label: 'Previous Month',
        startDate: this.toDateString(priorMonthStartDate),
        endDate: this.toDateString(priorMonthEndDate),
      },
      growthLabel: 'from prior month',
    };
  }

  /**
   * Net revenue for date range across all Income (level1 = 4) COA accounts.
   * credit − debit (credit-normal). Soft-deleted accounts excluded via join.
   */
  private async sumRevenueInRange(
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const raw = await this.transactionRepo
      .createQueryBuilder('tx')
      .innerJoin('tx.chartOfAccount', 'coa')
      .select(
        'COALESCE(SUM(COALESCE(tx.creditAmount, 0) - COALESCE(tx.debitAmount, 0)), 0)',
        'total',
      )
      .where('coa.level1 = :level1', { level1: COA_REVENUE_LEVEL1 })
      .andWhere('tx.transactionDate >= :startDate', { startDate })
      .andWhere('tx.transactionDate <= :endDate', { endDate })
      .getRawOne<{ total: string | number }>();

    return Math.round((Number(raw?.total) || 0) * 100) / 100;
  }
}
