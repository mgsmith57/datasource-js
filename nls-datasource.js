class AggregatorCount {
    constructor() {
        this.count = 0;
    }
    aggregate(name, value) {
        return ++this.count;
    }
}
class AggregatorSum {
    constructor() {
        this.total = 0;
    }
    aggregate(name, value) {
        if (value === null || isNaN(value)) {
            return this.total;
        }
        return this.total += value;
    }
}
class AggregatorAverage {
    constructor() {
        this.count = 0;
        this.total = 0;
    }
    aggregate(name, value) {
        if (value === null || isNaN(value)) {
            return this.count == 0 ? 0 : this.total / this.count;
        }
        this.count++;
        this.total += value;
        return this.count == 0 ? 0 : this.total / this.count;
    }
}
class AggregatorAverageIgnoreZeros {
    constructor() {
        this.count = 0;
        this.total = 0;
    }
    aggregate(name, value) {
        if (value === null || isNaN(value) || value == 0) {
            return this.count == 0 ? 0 : this.total / this.count;
        }
        this.count++;
        this.total += value;
        return this.count == 0 ? 0 : this.total / this.count;
    }
}
class AggregatorLastValue {
    aggregate(name, value) {
        return value;
    }
}
class AggregatorFirstValue {
    aggregate(name, value) {
        if (this.first === null) {
            this.first = value;
        }
        return value;
    }
}
class DataSourceAggregatorFactory {
    constructor() {
        this.registry = new Map;
        this.registry.set('count', () => new AggregatorCount());
        this.registry.set('sum', () => new AggregatorSum());
        this.registry.set('average', () => new AggregatorAverage());
        this.registry.set('averageNonZero', () => new AggregatorAverageIgnoreZeros());
        this.registry.set('first', () => new AggregatorFirstValue());
        this.registry.set('last', () => new AggregatorLastValue());
        this.registry.set('group', () => new AggregatorLastValue());
    }
    make(name) {
        const aggregator = this.registry.get(name);
        if (!aggregator) {
            throw `No aggregator found with name ${name}`;
        }
        return aggregator();
    }
}
class DataSource {
    constructor(meta, data, name) {
        this.meta = meta;
        this.data = data;
        this.name = name;
        this.builder = new DataSourceBuilder();
        this.inferDataTypes();
    }
    getMetaData() {
        return Array.from(this.meta.values()).sort(x => x.index);
    }
    getMetaDataMap() {
        return this.meta;
    }
    inferDataTypes() {
        const metaSorted = this.getMetaData();
        this.data.forEach(row => {
            metaSorted.forEach((v, i) => {
                const inferred = this.inferType(row[v.index]);
                if (v.type == null) {
                    v.type = inferred;
                }
                else if (inferred != null && v.type !== inferred) {
                    v.type = 'any';
                }
            });
        });
    }
    inferType(data) {
        if (data == null) {
            return null;
        }
        return typeof data;
    }
    copy(columns) {
        const meta = columns.map((name, index) => { return { name: name, index: index }; });
        const data = [];
        this.data.forEach(row => {
            const newRow = [];
            meta.forEach(m => {
                newRow[m.index] = row[this.meta.get(m.name).index];
            });
            data.push(newRow);
        });
        return new DataSource(meta.reduce((o, i) => o.set(i.name, i), new Map), data);
    }
    filter(filterFn) {
        return new DataSource(this.meta, this.data.filter(x => filterFn(this.meta, x)));
    }
    group(aggregate, comparator) {
        const aggregatorFactory = new DataSourceAggregatorFactory();
        const aggregatorMap = aggregate.reduce((o, i) => o.set(i.alias || i.field, i), new Map);
        const groupFields = aggregate.filter(x => x.aggregator === 'group').map(x => x.field);
        const groupIndex = new Map;
        const sourceIndex = [];
        const metaSorted = aggregate
            .map(x => x.alias || x.field)
            .map((field, index) => { return { name: field, index: index }; });
        metaSorted.forEach(m => {
            sourceIndex[m.index] = this.meta.get(aggregatorMap.get(m.name).field).index;
        });
        const data = [];
        this.data.forEach(row => {
            const group = groupFields.map(field => row[this.meta.get(field).index]).join('/');
            if (!groupIndex.has(group)) {
                data.push([]);
                groupIndex.set(group, {
                    index: data.length - 1,
                    aggregators: metaSorted.map(m => aggregatorFactory.make(aggregatorMap.get(m.name).aggregator))
                });
            }
            const groupMeta = groupIndex.get(group);
            const rowArray = data[groupMeta.index];
            metaSorted.forEach(m => {
                rowArray[m.index] = groupMeta.aggregators[m.index].aggregate(m.name, row[sourceIndex[m.index]]);
            });
        });
        const meta = metaSorted.reduce((o, i) => o.set(i.name, i), new Map);
        if (comparator) {
            data.sort((l, r) => {
                return comparator(meta, l, r);
            });
        }
        return new DataSource(meta, data);
    }
    unique(field) {
        const index = this.meta.get(field).index;
        const values = this.data.reduce((s, r) => s.add(r[index]), new Set);
        return Array.from(values).sort();
    }
}
class DataSourceBuilder {
    constructor() {
    }
    fromNames(names) {
        const meta = new Map;
        let i = 0;
        for (let name of names) {
            meta.set(name, { name: name, index: i++ });
        }
        return meta;
    }
    fromObjectArray(data, name) {
        const m = this.buildMeta(data);
        const d = this.buildData(m, data);
        return new DataSource(m, d, name);
    }
    buildMeta(data) {
        return this.fromNames(new Set(data.flatMap(x => Object.getOwnPropertyNames(x))));
    }
    buildData(meta, data) {
        const metaSorted = Array.from(meta.values()).sort(x => x.index);
        const dataArray = [];
        data.forEach(row => {
            const rowArray = [];
            metaSorted.forEach(m => {
                rowArray[m.index] = row[m.name];
            });
            dataArray.push(rowArray);
        });
        return dataArray;
    }
}
class DataSourceMap {
    constructor() {
        this.dataSources = new Map();
    }
    set(name, ds) {
        this.dataSources.set(name, ds);
        const event = new Event('ds.change.' + name);
        dispatchEvent(event);
        return this;
    }
    get(name) {
        return this.dataSources.get(name);
    }
}
window.dataSources = new DataSourceMap();
//# sourceMappingURL=nls-datasource.js.map