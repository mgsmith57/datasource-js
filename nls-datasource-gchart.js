/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
class GChartAbstractChart {
    constructor(element) {
        this.element = element;
        window.addEventListener('resize', e => {
            if (element.dataSource) {
                const that = this;
                setTimeout(function () { that.render(); }, 1000);
            }
        });
    }
    getDefaultOptions() {
        const optionsDiv = document.getElementById('gchart-options');
        const options = optionsDiv ? optionsDiv.getAttribute('data-default-options') : '{}';
        return options ? JSON.parse(options) : {};
    }
    getOptions() {
        return Object.assign(Object.assign({}, this.getDefaultOptions()), this.element.chartOptions);
    }
}
class GChartTable extends GChartAbstractChart {
    constructor(element) {
        super(element);
        this.table = new google.visualization.Table(this.element.element);
    }
    render() {
        this.table.draw(GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}
class GChartPieChart extends GChartAbstractChart {
    constructor(element) {
        super(element);
        this.chart = new google.visualization.PieChart(this.element.element);
    }
    render() {
        this.chart.draw(GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}
class GChartBarChart extends GChartAbstractChart {
    constructor(element) {
        super(element);
        this.chart = new google.visualization.BarChart(this.element.element);
    }
    render() {
        const pivot = "true" === this.element.element.getAttribute('data-chart-pivot');
        this.chart.draw(pivot ? GChartUtil.createSegmentedDataTable(this.element.getDataSource()) : GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}
class GChartColumnChart extends GChartAbstractChart {
    constructor(element) {
        super(element);
        this.chart = new google.visualization.ColumnChart(this.element.element);
    }
    render() {
        const pivot = "true" === this.element.element.getAttribute('data-chart-pivot');
        this.chart.draw(pivot ? GChartUtil.createSegmentedDataTable(this.element.getDataSource()) : GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}
class GChartBubbleChart extends GChartAbstractChart {
    constructor(element) {
        super(element);
        this.chart = new google.visualization.BubbleChart(this.element.element);
    }
    render() {
        this.chart.draw(GChartUtil.createDataTable(this.element.getDataSource()), this.getOptions());
    }
}
class GChartUtil {
    static createSegmentedDataTableIfRequired(ds) {
        const md = ds.getMetaData();
        return md.length == 2
            ? GChartUtil.createDataTable(ds)
            : GChartUtil.createDataTable(ds);
    }
    static createSegmentedDataTable(ds) {
        const data = new google.visualization.DataTable();
        const md = ds.getMetaData();
        const dimensions = ds.unique(md[0].name);
        const segments = ds.unique(md[1].name);
        data.addColumn(md[0].type || 'number', md[0].name);
        segments.forEach(name => {
            data.addColumn('number', name);
        });
        const dataMap = new Map();
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
    static createDataTable(ds) {
        const data = new google.visualization.DataTable();
        ds.getMetaData().forEach(m => {
            data.addColumn(m.type || 'number', m.name);
        });
        data.addRows(ds.data);
        return data;
    }
}
class GChartChartFactory {
    constructor() {
        this.renderers = new Map();
        this.renderers.set('table', (element) => new GChartTable(element));
        this.renderers.set('pie', (element) => new GChartPieChart(element));
        this.renderers.set('bar', (element) => new GChartBarChart(element));
        this.renderers.set('column', (element) => new GChartColumnChart(element));
        this.renderers.set('bubble', (element) => new GChartBubbleChart(element));
    }
    make(name, element) {
        return this.renderers.get(name)(element);
    }
}
window.dsChartFactoryRegistry.set('gchart', new GChartChartFactory());
//# sourceMappingURL=nls-datasource-gchart.js.map