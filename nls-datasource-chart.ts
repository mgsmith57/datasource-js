/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
abstract class NlsAbstractChart implements DataSourceChart {
    element : DataSourceChartElement;

    constructor(element : DataSourceChartElement) {
        this.element = element;
    }

    abstract render(): void;
}

class NlsScoreCard extends NlsAbstractChart {
    title : HTMLElement;
    value : HTMLElement;

    constructor(element : DataSourceChartElement) {
        super(element);
        this.title = document.createElement('div');
        this.title.classList.add('scorecard-title');
        element.element.appendChild(this.title);
        this.value = document.createElement('div');
        this.value.classList.add('scorecard-value');
        element.element.appendChild(this.value);
    }

    render(): void {
        this.title.innerText = this.element.getDataSource().getMetaData()[0].name;
        this.value.innerText = new Intl.NumberFormat(this.element.element.getAttribute('data-chart-locale') || 'en-GB', {
            notation: "compact",
            compactDisplay: "short",
            style: this.element.element.getAttribute('data-chart-style') || 'decimal',
            currency: this.element.element.getAttribute('data-chart-currency') || 'GBP'
        }).format(this.element.getDataSource().data[0][0]);
    }
}

class NlsChartFactory implements DataSourceChartFactory {
    renderers : Map<string, Function> = new Map<string, Function>();

    constructor() {
        this.renderers.set('scorecard', (element) => new NlsScoreCard(element))
    }

    make(name: string, element: DataSourceElement): DataSourceChart {
        return this.renderers.get(name)(element);
    }
}

window.dsChartFactoryRegistry.set('nlschart', new NlsChartFactory());