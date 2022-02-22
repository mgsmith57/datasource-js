/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
class GChartAbstractChart {
    constructor(element) {
        this.element = element;
    }
}
class GChartTable extends GChartAbstractChart {
    constructor(element) {
        super(element);
        this.table = new google.visualization.Table(this.element.element);
    }
    render() {
        const data = new google.visualization.DataTable();
        this.element.getDataSource().getMetaData().forEach(m => {
            data.addColumn(m.type || 'number', m.name);
        });
        data.addRows(this.element.getDataSource().data);
        this.table.draw(data, this.element.chartOptions);
    }
}
class GChartChartFactory {
    constructor() {
        this.renderers = new Map();
        this.renderers.set('table', (element) => new GChartTable(element));
    }
    make(name, element) {
        return this.renderers.get(name)(element);
    }
}
window.dsChartFactoryRegistry.set('gchart', new GChartChartFactory());
//# sourceMappingURL=nls-datasource-gchart.js.map