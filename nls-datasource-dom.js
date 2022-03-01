class DataSourceElement {
    constructor(element) {
        this.element = element;
        this.source = this.element.getAttribute('data-ds-source');
        addEventListener('ds.change.' + this.source, this.renderInternal.bind(this));
    }
    renderInternal() {
        this.render();
    }
}
class DataSourceChartElement extends DataSourceElement {
    constructor(element) {
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
    getDataSource() {
        return this.dataSource;
    }
    render() {
        const filter = this.element.getAttribute('data-ds-filter');
        const aggregateConf = this.element.getAttribute('data-ds-aggregate');
        let dataSource = DataSourceDomUtil.filter(window.dataSources.get(this.source), filter);
        if (aggregateConf) {
            const aggregate = aggregateConf
                .split(',')
                .map(ac => {
                const tokens = ac.split(":");
                return {
                    field: tokens[0].trim(),
                    aggregator: tokens[1].trim(),
                    title: tokens.length > 2 ? tokens[2].trim() : tokens[0].trim()
                };
            });
            dataSource = dataSource.group(aggregate.map(x => {
                return {
                    aggregator: x.aggregator,
                    field: x.field,
                    alias: x.title
                };
            }));
        }
        this.dataSource = dataSource;
        this.chart.render();
    }
}
class DataSourceChartFactoryRegistry {
    constructor() {
        this.factories = new Map();
    }
    set(name, factory) {
        this.factories.set(name, factory);
        return this;
    }
    get(name) {
        const factory = this.factories.get(name);
        if (!factory) {
            throw `No chart factory found with name ${name}`;
        }
        return factory;
    }
}
class DataSourceFilterControl extends DataSourceElement {
    constructor(element, group) {
        super(element);
        this.sortAscending = true;
        this.sortField = 'field';
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
            };
        }
        else {
            this.metric = {
                field: this.field,
                aggregator: 'count',
                alias: 'Count'
            };
        }
        this.sortAscending = element.getAttribute('data-ds-sort-direction') !== 'descending';
        this.sortField = this.metric != null
            ? element.getAttribute('data-ds-sort')
            : 'field';
    }
}
class DataSourceFilterGroup {
    constructor(source, target, controls) {
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
    onFilterChange(e) {
        if (e) {
            const controls = Array.from(this.controls).filter(c => c.element != e.target);
            controls.forEach(c => {
                c.render();
            });
        }
        let filter = '(' + Array.from(this.controls).map((e) => e.element.getAttribute('data-filter'))
            .filter(x => x)
            .join(') && (') + ')';
        window.dataSources.set(this.target, DataSourceDomUtil.filter(window.dataSources.get(this.source), filter));
    }
    static init() {
        const groups = new Map;
        Array.from(document.querySelectorAll('[data-ds-filter-control][data-ds-source][data-ds-target]')).forEach((e) => {
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
            new DataSourceFilterGroup(data[0], data[1], data[2]);
        });
    }
    filterWithoutElement(control) {
        const controls = Array.from(this.controls).filter(c => c != control);
        const filter = '(' + controls.map((e) => e.element.getAttribute('data-filter'))
            .filter(x => x)
            .join(') && (') + ')';
        const group = [{
                field: control.field,
                aggregator: 'group',
                alias: control.fieldTitle
            }];
        if (control.metric) {
            group.push(control.metric);
        }
        const field = control.sortField == 'metric' ? control.metric.alias : control.fieldTitle;
        const comparator = (meta, l, r) => {
            const m = meta.get(field);
            const lv = control.sortAscending ? l[m.index] : r[m.index];
            const rv = control.sortAscending ? r[m.index] : l[m.index];
            ;
            if (lv < rv) {
                return -1;
            }
            if (rv < lv) {
                return 1;
            }
            return 0;
        };
        return DataSourceDomUtil
            .filter(window.dataSources.get(this.source), filter)
            .group(group, comparator);
    }
}
class DataSourceMultiSelectFilterControl extends DataSourceFilterControl {
    constructor(element, group) {
        super(element, group);
    }
    buildFilter() {
        const inputs = this.dropdown.querySelectorAll('li input');
        const checked = this.dropdown.querySelectorAll('li input:checked');
        let filter = '';
        if (inputs.length != 0 && checked.length == 0) {
            // filter = '1 === 0'
            filter = '';
        }
        else if (inputs.length == checked.length) {
            filter = '';
        }
        else {
            const values = Array.from(checked).map((e) => e.getAttribute("value")).sort();
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
    updateButton() {
        const inputs = this.dropdown.querySelectorAll('li input');
        const checked = this.dropdown.querySelectorAll('li input:checked');
        const values = Array.from(checked).map((e) => e.getAttribute("value")).sort();
        if (checked.length == 0 || inputs.length == checked.length) {
            this.buttonLabel.innerText = this.fieldTitle;
            this.buttonPill.innerText = '';
            this.buttonLabel.setAttribute('title', null);
        }
        else {
            this.buttonLabel.innerText = this.fieldTitle + '...';
            this.buttonPill.innerText = ` (${checked.length})`;
            this.buttonLabel.setAttribute('title', values.join(','));
        }
    }
    updateCheckAll() {
        const inputs = this.dropdown.querySelectorAll('li input').length;
        const checked = this.dropdown.querySelectorAll('li input:checked').length;
        this.checkAll.disabled = inputs == 0;
        this.checkAll.checked = checked == inputs;
        this.checkAll.indeterminate = checked > 0 && checked < inputs;
    }
    render() {
        const that = this;
        function selectionChange() {
            that.updateButton();
            that.buildFilter();
            that.updateCheckAll();
        }
        function toggleDropdown() {
            that.dropdownContainer.style.display = 'block';
            that.dropdownContainer.focus();
        }
        function onCheckAll(event) {
            const inputs = that.dropdown.querySelectorAll('li input');
            Array.from(inputs).forEach((e) => {
                e.checked = that.checkAll.checked;
            });
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
            this.dropdownContainer.classList.add('ds-filter-dropdown-container');
            this.dropdownContainer.tabIndex = -1;
            this.element.appendChild(this.dropdownContainer);
            const dropdownHeader = document.createElement('div');
            dropdownHeader.classList.add('ds-filter-dropdown-header');
            this.dropdownContainer.appendChild(dropdownHeader);
            this.checkAll = document.createElement('input');
            this.checkAll.setAttribute('type', 'checkbox');
            this.checkAll.classList.add('ds-filter-header-checkall');
            this.checkAll.addEventListener('change', onCheckAll);
            dropdownHeader.appendChild(this.checkAll);
            const dropdownLabel = document.createElement('span');
            dropdownLabel.classList.add('ds-filter-header-field');
            dropdownLabel.innerText = this.fieldTitle;
            dropdownHeader.appendChild(dropdownLabel);
            const dropdownMetric = document.createElement('span');
            dropdownMetric.classList.add('ds-filter-header-metric');
            dropdownMetric.innerText = this.metric.alias;
            dropdownHeader.appendChild(dropdownMetric);
            this.dropdown = document.createElement('div');
            this.dropdown.classList.add('ds-filter-dropdown');
            this.dropdownContainer.appendChild(this.dropdown);
        }
        const checked = this.dropdown.querySelectorAll('li input:checked');
        const values = new Set(Array.from(checked).map((e) => e.getAttribute("value")));
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
            label.classList.add('ds-filter-item-value');
            label.appendChild(document.createTextNode(v));
            const item = document.createElement('li');
            item.appendChild(input);
            item.appendChild(label);
            if (r.length > 1) {
                const mlabel = document.createElement('label');
                mlabel.classList.add('ds-filter-item-metric');
                mlabel.appendChild(document.createTextNode(typeof r[1] === 'number'
                    ? r[1].toLocaleString('en', { useGrouping: true })
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
    constructor() {
        this.registry = new Map();
        this.set('multi-select', (element, group) => new DataSourceMultiSelectFilterControl(element, group));
    }
    set(name, filterControlFactoryFn) {
        this.registry.set(name, filterControlFactoryFn);
        return this;
    }
    make(element, group) {
        const name = element.getAttribute('data-ds-filter-control');
        const factory = this.registry.get(name);
        if (!factory) {
            throw `No filter control factory found with name ${name}`;
        }
        return factory(element, group);
    }
    static get() {
        return DataSourceFilterControlFactory.instance;
    }
}
DataSourceFilterControlFactory.instance = new DataSourceFilterControlFactory();
class DataSourceDomUtil {
    static filter(dataSource, filter) {
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
window.dsChartFactoryRegistry = new DataSourceChartFactoryRegistry();
window.dsFilterControlFactory = DataSourceFilterControlFactory.get();
//# sourceMappingURL=nls-datasource-dom.js.map