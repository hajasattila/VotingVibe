import {
ApexNonAxisChartSeries, ApexChart,
ApexResponsive, ApexTitleSubtitle,
ApexTheme, ApexLegend
} from 'ng-apexcharts';

export type ChartOptions = {
    series: ApexNonAxisChartSeries;
    chart: ApexChart;
    labels: string[];
    responsive: ApexResponsive[];
    title: ApexTitleSubtitle;
    theme?: ApexTheme;
    legend?: ApexLegend;
};
