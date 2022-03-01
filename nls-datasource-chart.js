/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
class NlsAbstractChart {
    constructor(element) {
        this.element = element;
    }
}
class NlsScoreCard extends NlsAbstractChart {
    constructor(element) {
        super(element);
        this.title = document.createElement('div');
        this.title.classList.add('scorecard-title');
        element.element.appendChild(this.title);
        this.value = document.createElement('div');
        this.value.classList.add('scorecard-value');
        element.element.appendChild(this.value);
    }
    render() {
        this.title.innerText = this.element.getDataSource().getMetaData()[0].name;
        this.value.innerText = new Intl.NumberFormat(this.element.element.getAttribute('data-chart-locale') || 'en-GB', {
            notation: "compact",
            compactDisplay: "short",
            style: this.element.element.getAttribute('data-chart-style') || 'decimal',
            currency: this.element.element.getAttribute('data-chart-currency') || 'GBP'
        }).format(this.element.getDataSource().data[0][0]);
    }
}
class NlsChartFactory {
    constructor() {
        this.renderers = new Map();
        this.renderers.set('scorecard', (element) => new NlsScoreCard(element));
    }
    make(name, element) {
        return this.renderers.get(name)(element);
    }
}
window.dsChartFactoryRegistry.set('nlschart', new NlsChartFactory());
//# sourceMappingURL=nls-datasource-chart.js.map