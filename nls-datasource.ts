/*! 9ls datasource.js v0.0.1 | (c) Nine Lives Software Ltd  */
interface DataSourceMeta {
    name: string;
    index: number;
    type?: string;
    title?: string;
}

interface DataSourceFilterFunction {
    (meta: Map<string, DataSourceMeta>, row: any[]) : boolean;
}

interface DataSourceAggregator {
    aggregate(name: string, value: any, data?: any[]) : any;
}

class AggregatorCount implements DataSourceAggregator {
    count: number = 0;
    public aggregate(name: string, value: any) : number {
        return ++this.count;
    }
}

class AggregatorCountDistinct implements DataSourceAggregator {
    seen: Set<any> = new Set();
    count: number = 0;
    public aggregate(name: string, value: any) : number {
        if (!this.seen.has(value)) {
            ++this.count;
            this.seen.add(value);
        }
        return this.count;
    }
}

class AggregatorSum implements DataSourceAggregator {
    total: number = 0;
    public aggregate(name: string, value: any) : number {
        if (value === null || isNaN(value)) {
            return this.total;
        }
        return this.total += value;
    }
}

class AggregatorAverage implements DataSourceAggregator {
    count: number = 0;
    total: number = 0;
    public aggregate(name: string, value: any) : number {
        if (value === null || isNaN(value)) {
            return this.count == 0 ? 0 : this.total / this.count;
        }
        this.count++;
        this.total += value;
        return this.count == 0 ? 0 : this.total / this.count;
    }
}

class AggregatorAverageIgnoreZeros implements DataSourceAggregator {
    count: number = 0;
    total: number = 0;
    public aggregate(name: string, value: any) : number {
        if (value === null || isNaN(value) || value == 0) {
            return this.count == 0 ? 0 : this.total / this.count;
        }
        this.count++;
        this.total += value;
        return this.count == 0 ? 0 : this.total / this.count;
    }
}

class AggregatorLastValue implements DataSourceAggregator {
    public aggregate(name: string, value: any) : number {
        return value;
    }
}

class AggregatorFirstValue implements DataSourceAggregator {
    first: any;
    public aggregate(name: string, value: any) : number {
        if (this.first === null) {
            this.first = value;
        }
        return value;
    }
}

class DataSourceAggregatorFactory {
    static instance: DataSourceAggregatorFactory = new DataSourceAggregatorFactory();
    registry: Map<string, Function>;

    constructor() {
        this.registry = new Map;
        this.registry.set('count', (meta) => new AggregatorCount() );
        this.registry.set('countDistinct', (meta) => new AggregatorCountDistinct() );
        this.registry.set('sum', (meta) => new AggregatorSum() );
        this.registry.set('average', (meta) =>  new AggregatorAverage() );
        this.registry.set('averageNonZero', (meta) =>  new AggregatorAverageIgnoreZeros() );
        this.registry.set('first', (meta) =>  new AggregatorFirstValue() );
        this.registry.set('last', (meta) =>  new AggregatorLastValue() );
        this.registry.set('group', (meta) =>  new AggregatorLastValue() );
    }

    public make(name : string, ds : DataSource) : DataSourceAggregator {
        const aggregator = this.registry.get(name);
        if (!aggregator) {
            throw `No aggregator found with name ${name}`
        }
        return aggregator(ds.meta);
    }

    public static get() : DataSourceAggregatorFactory {
        return DataSourceAggregatorFactory.instance;
    }
}

interface AggregatorParameter {
    aggregator: string;
    field: string;
    alias?: string;
}

class DataSource {
    name?: string;
    meta: Map<string, DataSourceMeta>
    data: Array<any[]>;
    builder: DataSourceBuilder;

    constructor(meta : Map<string, DataSourceMeta>, data : Array<any[]>, name? : string) {
        this.meta = meta;
        this.data = data;
        this.name = name;
        this.builder = new DataSourceBuilder();
        this.inferDataTypes();
    }

    public getMetaData() : DataSourceMeta[] {
        return Array.from(this.meta.values()).sort( x => x.index);
    }

    public getMetaDataMap() : Map<string, DataSourceMeta> {
        return this.meta;
    }

    public inferDataTypes() : void {
        const metaSorted = this.getMetaData();

        this.data.forEach(row => {
            metaSorted.forEach((v, i) => {
                const inferred = this.inferType(row[v.index]);

                if (v.type == null) {
                    v.type = inferred;
                } else if (inferred != null && v.type !== inferred) {
                    v.type = 'any'
                }
            });
        });

    }

    public inferType(data: any) : string {
        if (data == null) {
            return null;
        }

        return typeof data;
    }


    public copy(columns: string[]) : DataSource {
        const meta : DataSourceMeta[] = columns.map( (name, index) => { return {name: name, index: index} });
        const data : Array<any[]> = [];
        this.data.forEach(row => {
            const newRow = [];
            meta.forEach(m => {
                newRow[m.index] = row[this.meta.get(m.name).index];
            });
            data.push(newRow);
        });

        return new DataSource(meta.reduce((o, i) => o.set(i.name, i), new Map), data);
    }

    public filter(filterFn: DataSourceFilterFunction) : DataSource{
        return new DataSource(
            this.meta,
            this.data.filter( x => filterFn(this.meta, x)))
    }

    public group(aggregate: AggregatorParameter[], comparator?: (ds: Map<string, DataSourceMeta>, l: any[], r: any[]) => number) : DataSource {
        const aggregatorFactory = DataSourceAggregatorFactory.get();
        const aggregatorMap = aggregate.reduce((o, i) => o.set(i.alias || i.field, i), new Map);

        const groupFields : string[] = aggregate.filter(x => x.aggregator === 'group').map(x => x.field);
        const groupIndex = new Map;

        const sourceIndex : number[] = [];
        const metaSorted : DataSourceMeta[] = aggregate
            .map(x => x.alias || x.field)
            .map((field,  index) => { return { name: field, index: index}});

        metaSorted.forEach(m => {
            const field = aggregatorMap.get(m.name).field;
            const meta = this.meta.get(field);
            if (!meta) {
                throw "No field found with name " + field;
            }
            sourceIndex[m.index] = meta.index;
        });

        const data : any[] = [];
        this.data.forEach(row => {
            const group = groupFields.map(field => row[this.meta.get(field).index]).join('/');
            if (!groupIndex.has(group)) {
                data.push([]);
                groupIndex.set(group, {
                    index: data.length - 1,
                    aggregators: metaSorted.map(m => aggregatorFactory.make(aggregatorMap.get(m.name).aggregator, this))
                })
            }

            const groupMeta = groupIndex.get(group);
            const rowArray = data[groupMeta.index];

            metaSorted.forEach(m => {
                rowArray[m.index] = groupMeta.aggregators[m.index].aggregate(m.name, row[sourceIndex[m.index]], row);
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

    public unique(field: string) : any[] {
        const index = this.meta.get(field).index;
        const values = this.data.reduce((s, r) => s.add(r[index]), new Set);
        return Array.from(values).sort();
    }
}

class DataSourceBuilder {
    constructor() {
    }

    public fromNames(names: Set<string>) : Map<string, DataSourceMeta> {
        const meta = new Map;
        let i: number = 0;
        for (let name of names) {
            meta.set(name, {name: name, index: i++});
        }
        return meta;
    }

    public fromObjectArray(data: Object[], name? : string) : DataSource {
        const m = this.buildMeta(data);
        const d = this.buildData(m, data);
        return new DataSource(m, d, name);
    }

    private buildMeta(data: Object[]) : Map<string, DataSourceMeta> {
        return this.fromNames(new Set(data.flatMap( x => Object.getOwnPropertyNames(x))));
    }

    private buildData(meta: Map<string, DataSourceMeta>, data: Object[]) : Array<any[]> {
        const metaSorted : DataSourceMeta[] = Array.from(meta.values()).sort( x => x.index);
        const dataArray : Array<any[]> = [];

        data.forEach(row => {
            const rowArray : any[] = [];
            metaSorted.forEach(m => {
                rowArray[m.index] = row[m.name];
            });
            dataArray.push(rowArray);
        });

        return dataArray;
    }
}

class DataSourceMap {
    dataSources : Map<string, DataSource>;

    constructor() {
        this.dataSources = new Map<string, DataSource>();
    }

    public set(name: string, ds: DataSource) : DataSourceMap {
        this.dataSources.set(name, ds);
        const event = new Event('ds.change.' + name);
        dispatchEvent(event);
        return this;
    }

    public get(name: string) : DataSource {
        return this.dataSources.get(name);
    }
}

interface Window { dataSources: DataSourceMap; }
window.dataSources = new DataSourceMap();
