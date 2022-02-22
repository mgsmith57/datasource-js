/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
abstract class GChartAbstractChart implements DataSourceChart {
    element : DataSourceChartElement;

    constructor(element : DataSourceChartElement) {
        this.element = element;
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
        const data = new google.visualization.DataTable();
        this.element.getDataSource().getMetaData().forEach(m => {
            data.addColumn(m.type || 'number', m.name);
        });
        data.addRows(this.element.getDataSource().data);
        this.table.draw(data, this.element.chartOptions);
    }
}

class GChartChartFactory implements DataSourceChartFactory {
    renderers : Map<string, Function> = new Map<string, Function>();

    constructor() {
        this.renderers.set('table', (element) => new GChartTable(element))
    }

    make(name: string, element: DataSourceElement): DataSourceChart {
        return this.renderers.get(name)(element);
    }
}

window.dsChartFactoryRegistry.set('gchart', new GChartChartFactory());