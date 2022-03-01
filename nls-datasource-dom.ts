/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
interface DataSourceAggregateConf {
    field: string;
    aggregator: string;
    title: string;
}

abstract class DataSourceElement {
    element: HTMLElement;
    source: string;

    constructor(element: HTMLElement) {
        this.element = element;
        this.source = this.element.getAttribute('data-ds-source');

        addEventListener('ds.change.' + this.source, this.renderInternal.bind(this));
    }

    private renderInternal() {
        this.render();
    }

    public abstract render();
}

class DataSourceChartElement extends DataSourceElement {
    dataSource: DataSource;
    chart: DataSourceChart;
    chartOptions?: object;
    filterControls?: NodeList;

    constructor(element: HTMLElement) {
        super(element);
        const chartRenderer = element.getAttribute('data-chart-renderer');
        const chartType = element.getAttribute('data-chart-type');
        const chartOptions = element.getAttribute('data-chart-options');

        if (chartOptions) {
            this.chartOptions = JSON.parse(chartOptions);
        }

        const chartFactory = window.dsChartFactoryRegistry.get(chartRenderer);
        this.chart = chartFactory.make(chartType, this);

        if (window.dataSources.get(this.source)) {
            this.render();
        }
    }

    public getDataSource(): DataSource {
        return this.dataSource;
    }

    public render() {
        const filter = this.element.getAttribute('data-ds-filter');
        const aggregateConf = this.element.getAttribute('data-ds-aggregate');

        let dataSource = DataSourceDomUtil.filter(
            window.dataSources.get(this.source),
            filter);

        if (aggregateConf) {
            const aggregate: DataSourceAggregateConf[] = aggregateConf
                .split(',')
                .map(ac => {
                    const tokens = ac.split(":");
                    return {
                        field: tokens[0].trim(),
                        aggregator: tokens[1].trim(),
                        title: tokens.length > 2 ? tokens[2].trim() : tokens[0].trim()
                    };
                });

            dataSource = dataSource.group(
                aggregate.map(x => {
                    return {
                        aggregator: x.aggregator,
                        field: x.field,
                        alias: x.title
                    };
                })
            );
        }

        this.dataSource = dataSource;
        this.chart.render();
    }
}

interface DataSourceChart {
    render(): void;
}

interface DataSourceChartFactory {
    make(name: string, element: DataSourceChartElement): DataSourceChart;
}

class DataSourceChartFactoryRegistry {
    factories: Map<string, DataSourceChartFactory>;

    constructor() {
        this.factories = new Map<string, DataSourceChartFactory>();
    }

    public set(name: string, factory: DataSourceChartFactory): DataSourceChartFactoryRegistry {
        this.factories.set(name, factory);
        return this;
    }

    public get(name: string): DataSourceChartFactory {
        const factory = this.factories.get(name);
        if (!factory) {
            throw `No chart factory found with name ${name}`;
        }
        return factory;
    }
}

abstract class DataSourceFilterControl extends DataSourceElement {
    element: HTMLElement;
    group: DataSourceFilterGroup;
    field: string;
    fieldTitle: string;
    sortAscending: boolean = true;
    sortField: string = 'field';
    metric: AggregatorParameter;
    lastFilter: string;

    constructor(element: HTMLElement, group: DataSourceFilterGroup) {
        super(element);
        const fieldValue = element.getAttribute('data-ds-filter-field').split(":");

        this.element = element;
        this.group = group;
        this.field = fieldValue[0].trim();
        this.fieldTitle = fieldValue.length > 1 ? fieldValue[1].trim() : this.field;

        const metric = element.getAttribute('data-ds-metric-field');
        if (metric) {
            const tokens = metric.split(':');
            this.metric = {
                field: tokens[0].trim(),
                aggregator: tokens[1].trim(),
                alias: tokens.length > 2 ? tokens[2].trim() : tokens[0].trim()
            }
        } else {
            this.metric = {
                field: this.field,
                aggregator: 'count',
                alias: 'Count'
            }
        }

        this.sortAscending = element.getAttribute('data-ds-sort-direction') !== 'descending';
        this.sortField = this.metric != null
            ? element.getAttribute('data-ds-sort')
            : 'field';

    }

    abstract render(): void;
}

class DataSourceFilterGroup {
    source: string;
    target: string;
    controls: DataSourceFilterControl[];

    constructor(source: string, target: string, controls: HTMLElement[]) {
        this.source = source;
        this.target = target;
        this.controls = controls.map(e => DataSourceFilterControlFactory.get().make(e, this));
        this.controls.forEach(e => e.element.addEventListener('ds.filterChange', this.onFilterChange.bind(this)));

        addEventListener('ds.change.' + this.source, this.onFilterChange.bind(this));

        if (window.dataSources.get(this.source)) {
            this.controls.forEach(e => e.render());
            this.onFilterChange(null);
        }
    }

    private onFilterChange(e) {
        if (e) {
            const controls = Array.from(this.controls).filter(c => c.element != e.target);
            controls.forEach(c => {
                c.render()
            });
        }

        let filter = '(' + Array.from(this.controls).map((e: DataSourceFilterControl) => e.element.getAttribute('data-filter'))
            .filter(x => x)
            .join(') && (') + ')';

        window.dataSources.set(this.target, DataSourceDomUtil.filter(
            window.dataSources.get(this.source),
            filter));
    }

    public static init() {
        const groups: Map<string, [string, string, HTMLElement[]]> = new Map;
        Array.from(document.querySelectorAll('[data-ds-filter-control][data-ds-source][data-ds-target]')).forEach((e: HTMLElement) => {
            const key = e.getAttribute('data-ds-source') + '/' + e.getAttribute('data-ds-target');
            const data = groups.get(key) || [
                e.getAttribute('data-ds-source'),
                e.getAttribute('data-ds-target'),
                []
            ];
            data[2].push(e);
            groups.set(key, data);
        });

        Array.from(groups.values()).map((data) => {
            new DataSourceFilterGroup(data[0], data[1], data[2])
        });
    }

    filterWithoutElement(control: DataSourceFilterControl): DataSource {
        const controls = Array.from(this.controls).filter(c => c != control);

        const filter = '(' + controls.map((e: DataSourceFilterControl) => e.element.getAttribute('data-filter'))
            .filter(x => x)
            .join(') && (') + ')';

        const group: AggregatorParameter[] = [{
            field: control.field,
            aggregator: 'group',
            alias: control.fieldTitle}];

        if (control.metric) {
            group.push(control.metric);
        }

        const field = control.sortField == 'metric' ? control.metric.alias : control.fieldTitle;
        const comparator = (meta:  Map<string, DataSourceMeta>, l : any[], r : any[]) => {
            const m = meta.get(field);
            const lv = control.sortAscending ? l[m.index] : r[m.index];
            const rv = control.sortAscending ? r[m.index] : l[m.index];;

            if (lv < rv) {
                return -1;
            }

            if (rv < lv) {
                return 1;
            }

            return 0;
        }

        return DataSourceDomUtil
            .filter(window.dataSources.get(this.source), filter)
            .group(group, comparator);
    }
}

class DataSourceMultiSelectFilterControl extends DataSourceFilterControl {
    dropdownContainer: HTMLElement;
    dropdown: HTMLElement;
    checkAll: HTMLInputElement;
    buttonLabel: HTMLElement;
    buttonPill: HTMLElement;

    constructor(element: HTMLElement, group: DataSourceFilterGroup) {
        super(element, group);
    }

    private buildFilter(): void {
        const inputs = this.dropdown.querySelectorAll('li input');
        const checked = this.dropdown.querySelectorAll('li input:checked');
        let filter: string = '';

        if (inputs.length != 0 && checked.length == 0) {
            // filter = '1 === 0'
            filter = '';
        } else if (inputs.length == checked.length) {
            filter = '';
        } else {
            const values = Array.from(checked).map((e: HTMLElement) => e.getAttribute("value")).sort();
            filter = `['${values.join("','")}'].includes(String({${this.field}}))`;
        }

        const lastFilter = this.lastFilter;
        this.element.setAttribute('data-filter', filter);
        this.lastFilter = filter;

        if (lastFilter !== filter) {
            const event = new Event('ds.filterChange');
            this.element.dispatchEvent(event);
        }
    }

    private updateButton(): void {
        const inputs = this.dropdown.querySelectorAll('li input');
        const checked = this.dropdown.querySelectorAll('li input:checked');
        const values = Array.from(checked).map((e: HTMLElement) => e.getAttribute("value")).sort();

        if(checked.length == 0 || inputs.length == checked.length) {
            this.buttonLabel.innerText = this.fieldTitle;
            this.buttonPill.innerText = '';
            this.buttonLabel.setAttribute('title', null);
        } else {
            this.buttonLabel.innerText = this.fieldTitle + '...';
            this.buttonPill.innerText = ` (${checked.length})`;
            this.buttonLabel.setAttribute('title', values.join(','));
        }
    }

    private updateCheckAll() {
        const inputs = this.dropdown.querySelectorAll('li input').length;
        const checked = this.dropdown.querySelectorAll('li input:checked').length;
        this.checkAll.disabled = inputs == 0;
        this.checkAll.checked = checked == inputs;
        this.checkAll.indeterminate = checked > 0 && checked < inputs;
    }

    render(): void {
        const that = this;

        function selectionChange() {
            that.updateButton();
            that.buildFilter();
            that.updateCheckAll();
        }

        function toggleDropdown() {
            that.dropdownContainer.style.display = 'block'
            that.dropdownContainer.focus();
        }

        function onCheckAll(event) {
            const inputs = that.dropdown.querySelectorAll('li input');
            Array.from(inputs).forEach((e : HTMLInputElement) => {
                e.checked = that.checkAll.checked;
            })
            selectionChange();
        }

        const data = this.group.filterWithoutElement(this);
        const list = document.createElement('ol');
        if (!this.dropdown) {
            const button = document.createElement('div');
            button.classList.add('ds-filter-button');
            button.addEventListener('click', toggleDropdown);

            this.buttonLabel = document.createElement('span');
            this.buttonLabel.classList.add('ds-filter-button-label');
            this.buttonLabel.innerText = this.fieldTitle;
            button.appendChild(this.buttonLabel);

            this.buttonPill = document.createElement('span');
            this.buttonPill.classList.add('ds-filter-button-pill');
            button.appendChild(this.buttonPill);
            this.element.appendChild(button);

            this.dropdownContainer = document.createElement('div');
            this.dropdownContainer.classList.add('ds-filter-dropdown-container')
            this.dropdownContainer.tabIndex = -1;
            this.element.appendChild(this.dropdownContainer);

            const dropdownHeader = document.createElement('div');
            dropdownHeader.classList.add('ds-filter-dropdown-header')
            this.dropdownContainer.appendChild(dropdownHeader);

            this.checkAll = document.createElement('input');
            this.checkAll.setAttribute('type', 'checkbox');
            this.checkAll.classList.add('ds-filter-header-checkall');
            this.checkAll.addEventListener('change', onCheckAll);
            dropdownHeader.appendChild(this.checkAll);

            const dropdownLabel = document.createElement('span');
            dropdownLabel.classList.add('ds-filter-header-field')
            dropdownLabel.innerText = this.fieldTitle;
            dropdownHeader.appendChild(dropdownLabel);

            const dropdownMetric = document.createElement('span');
            dropdownMetric.classList.add('ds-filter-header-metric')
            dropdownMetric.innerText = this.metric.alias;
            dropdownHeader.appendChild(dropdownMetric);

            this.dropdown = document.createElement('div');
            this.dropdown.classList.add('ds-filter-dropdown')
            this.dropdownContainer.appendChild(this.dropdown);
        }

        const checked = this.dropdown.querySelectorAll('li input:checked');
        const values = new Set(Array.from(checked).map((e: HTMLElement) => e.getAttribute("value")));
        this.dropdown.replaceChildren();
        data.data.forEach(r => {
            const v = r[0];
            const input = document.createElement('input');
            input.setAttribute('type', 'checkbox');
            input.setAttribute('value', v);
            input.checked = values.has(v) || checked.length == 0;
            input.classList.add('ds-filter-item-select');
            input.addEventListener('change', selectionChange.bind(this));

            const label = document.createElement('label');
            label.classList.add('ds-filter-item-value')
            label.appendChild(document.createTextNode(v));

            const item = document.createElement('li');
            item.appendChild(input);
            item.appendChild(label);

            if (r.length > 1) {
                const mlabel = document.createElement('label');
                mlabel.classList.add('ds-filter-item-metric')
                mlabel.appendChild(document.createTextNode(
                    typeof r[1] === 'number'
                        ? r[1].toLocaleString('en', {useGrouping:true})
                        : r[1]));
                item.appendChild(mlabel);
            }

            list.appendChild(item);
        });
        this.dropdown.appendChild(list);
        that.updateButton();
        that.buildFilter();
        that.updateCheckAll();
    }
}

class DataSourceFilterControlFactory {
    private static instance: DataSourceFilterControlFactory = new DataSourceFilterControlFactory();
    private registry: Map<string, Function>;

    constructor() {
        this.registry = new Map<string, Function>();
        this.set('multi-select', (element: HTMLElement, group: DataSourceFilterGroup) => new DataSourceMultiSelectFilterControl(element, group))
    }

    public set(name: string, filterControlFactoryFn: Function): DataSourceFilterControlFactory {
        this.registry.set(name, filterControlFactoryFn);
        return this;
    }

    public make(element: HTMLElement, group: DataSourceFilterGroup): DataSourceFilterControl {
        const name = element.getAttribute('data-ds-filter-control')
        const factory = this.registry.get(name);
        if (!factory) {
            throw `No filter control factory found with name ${name}`;
        }
        return factory(element, group);
    }

    public static get(): DataSourceFilterControlFactory {
        return DataSourceFilterControlFactory.instance;
    }
}

class DataSourceDomUtil {
    public static filter(dataSource: DataSource, filter: string) {
        let parsedFilter = filter;

        if (!parsedFilter || parsedFilter === '()') {
            return dataSource;
        }

        const matches = parsedFilter.match(/{(?<field>.*?)\}/gm);
        if (matches) {
            matches.forEach((m) => {
                const field = m.substring(1, m.length - 1);
                parsedFilter = parsedFilter.replace(m, 'arguments[1][arguments[0].get("' + field + '").index]');
            });
        }

        return dataSource.filter((m, d) => {
            return new Function('return ' + parsedFilter)(m, d);
        });
    }
}

interface Window {
    dsChartFactoryRegistry: DataSourceChartFactoryRegistry;
    dsFilterControlFactory: DataSourceFilterControlFactory;
}

window.dsChartFactoryRegistry = new DataSourceChartFactoryRegistry();
window.dsFilterControlFactory = DataSourceFilterControlFactory.get();
