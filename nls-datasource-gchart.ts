/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
abstract class GChartAbstractChart implements DataSourceChart {
    element : DataSourceChartElement;

    constructor(element : DataSourceChartElement) {
        this.element = element;
        window.addEventListener('resize', e => {
            if (element.dataSource) {
                const that = this;
                setTimeout(function(){ that.render() },1000);
            }
        });
    }

    public getDefaultOptions() : object {
        const optionsDiv = document.getElementById('gchart-options')
        const options = optionsDiv ? optionsDiv.getAttribute('data-default-options') : '{}';
        return options ? JSON.parse(options) : {};
    }

    public getOptions() : object {
        return { ...this.getDefaultOptions(), ...this.element.chartOptions };
    }

    abstract render(): void;
}

class GChartTable extends GChartAbstractChart {
    table : google.visualization.Table;

    constructor(element : DataSourceChartElement) {
        super(element);
        this.table = new google.visualization.Table(this.element.element);
    }

    render(): void {
        this.table.draw(GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}

class GChartPieChart extends GChartAbstractChart {
    chart : google.visualization.PieChart;

    constructor(element : DataSourceChartElement) {
        super(element);
        this.chart = new google.visualization.PieChart(this.element.element);
    }

    render(): void {
        this.chart.draw(GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}

class GChartBarChart extends GChartAbstractChart {
    chart : google.visualization.BarChart;

    constructor(element : DataSourceChartElement) {
        super(element);
        this.chart = new google.visualization.BarChart(this.element.element);
    }

    render(): void {
        const pivot = "true" === this.element.element.getAttribute('data-chart-pivot')
        this.chart.draw(
            pivot ? GChartUtil.createSegmentedDataTable(this.element.getDataSource()) : GChartUtil.createDataTable(this.element.getDataSource()),
            this.getOptions());
    }
}

class GChartColumnChart extends GChartAbstractChart {
    chart : google.visualization.ColumnChart;

    constructor(element : DataSourceChartElement) {
        super(element);
        this.chart = new google.visualization.ColumnChart(this.element.element);
    }

    render(): void {
        const pivot = "true" === this.element.element.getAttribute('data-chart-pivot')
        this.chart.draw(
            pivot ? GChartUtil.createSegmentedDataTable(this.element.getDataSource()) : GChartUtil.createDataTable(this.element.getDataSource()),
            this.getOptions());
    }
}

class GChartBubbleChart extends GChartAbstractChart {
    chart : google.visualization.BubbleChart;

    constructor(element : DataSourceChartElement) {
        super(element);
        this.chart = new google.visualization.BubbleChart(this.element.element);
    }

    render(): void {
        this.chart.draw(
            GChartUtil.createDataTable(this.element.getDataSource()),
            this.getOptions());
    }
}

class GChartUtil {
    public static createSegmentedDataTableIfRequired(ds: DataSource) : google.visualization.DataTable  {
        const md = ds.getMetaData();
        return md.length == 2
            ? GChartUtil.createDataTable(ds)
            : GChartUtil.createDataTable(ds);
    }

    public static createSegmentedDataTable(ds: DataSource) : google.visualization.DataTable  {
        const data = new google.visualization.DataTable();
        const md = ds.getMetaData();
        const dimensions = ds.unique(md[0].name);
        const segments = ds.unique(md[1].name);

        data.addColumn(md[0].type || 'number', md[0].name);
        segments.forEach( name => {
            data.addColumn('number', name);
        });

        const dataMap : Map<string, any> = new Map();
        ds.data.forEach(a => {
            dataMap.set(`${a[0]}/${a[1]}`, a[2]);
        });

        const rows = dimensions.map(d => {
            const r = [segments.length + 1];
            r[0] = d;
            segments.forEach((s, i) => {
                r[i + 1] = dataMap.get(`${d}/${s}`) || 0;
            });
            return r;
        });

        rows.sort((l, r) => {
            const lv = l.reduce((p, c, i) => { return i == 0 ? p : p + c; }, 0);
            const rv = r.reduce((p, c, i) => { return i == 0 ? p : p + c; }, 0);
            return rv - lv;
        });
        data.addRows(rows);
        return data;
    }

    public static createDataTable(ds: DataSource) : google.visualization.DataTable {
        const data = new google.visualization.DataTable();
        ds.getMetaData().forEach(m => {
            data.addColumn(m.type || 'number', m.name);
        });
        data.addRows(ds.data);
        return data;
    }
}

class GChartChartFactory implements DataSourceChartFactory {
    renderers : Map<string, Function> = new Map<string, Function>();

    constructor() {
        this.renderers.set('table', (element) => new GChartTable(element))
        this.renderers.set('pie', (element) => new GChartPieChart(element))
        this.renderers.set('bar', (element) => new GChartBarChart(element))
        this.renderers.set('column', (element) => new GChartColumnChart(element))
        this.renderers.set('bubble', (element) => new GChartBubbleChart(element))
    }

    make(name: string, element: DataSourceElement): DataSourceChart {
        return this.renderers.get(name)(element);
    }
}

window.dsChartFactoryRegistry.set('gchart', new GChartChartFactory());