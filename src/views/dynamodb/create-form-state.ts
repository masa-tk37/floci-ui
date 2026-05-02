export const createTableAlpineState = `{
  tableName: '',
  pk: { name: '', type: 'S' },
  hasSk: false,
  sk: { name: '', type: 'S' },
  billingMode: 'PAY_PER_REQUEST',
  rcu: 5,
  wcu: 5,
  gsi: [],
  lsi: [],
  streamEnabled: false,
  streamViewType: 'NEW_AND_OLD_IMAGES',
  error: null,
  submitting: false,

  addGsi() {
    this.gsi.push({
      indexName: '',
      pk: { name: '', type: 'S' },
      hasSk: false,
      sk: { name: '', type: 'S' },
      projectionType: 'ALL',
      nonKeyAttrs: '',
      rcu: 5,
      wcu: 5,
    });
  },
  removeGsi(i) {
    this.gsi.splice(i, 1);
  },
  addLsi() {
    this.lsi.push({
      indexName: '',
      sk: { name: '', type: 'S' },
      projectionType: 'ALL',
      nonKeyAttrs: '',
    });
  },
  removeLsi(i) {
    this.lsi.splice(i, 1);
  },

  buildPayload() {
    const attrMap = {};
    const addAttr = (name, type) => { if (name) attrMap[name] = type; };
    addAttr(this.pk.name, this.pk.type);
    if (this.hasSk) addAttr(this.sk.name, this.sk.type);
    for (const g of this.gsi) {
      addAttr(g.pk.name, g.pk.type);
      if (g.hasSk) addAttr(g.sk.name, g.sk.type);
    }
    for (const l of this.lsi) {
      addAttr(l.sk.name, l.sk.type);
    }
    const AttributeDefinitions = Object.entries(attrMap).map(([n, t]) => ({ AttributeName: n, AttributeType: t }));
    const KeySchema = [{ AttributeName: this.pk.name, KeyType: 'HASH' }];
    if (this.hasSk && this.sk.name) KeySchema.push({ AttributeName: this.sk.name, KeyType: 'RANGE' });

    const payload = {
      TableName: this.tableName,
      AttributeDefinitions,
      KeySchema,
      BillingMode: this.billingMode,
    };

    if (this.billingMode === 'PROVISIONED') {
      payload.ProvisionedThroughput = { ReadCapacityUnits: Number(this.rcu), WriteCapacityUnits: Number(this.wcu) };
    }

    if (this.gsi.length > 0) {
      payload.GlobalSecondaryIndexes = this.gsi.map(g => {
        const ks = [{ AttributeName: g.pk.name, KeyType: 'HASH' }];
        if (g.hasSk && g.sk.name) ks.push({ AttributeName: g.sk.name, KeyType: 'RANGE' });
        const proj = { ProjectionType: g.projectionType };
        if (g.projectionType === 'INCLUDE' && g.nonKeyAttrs) {
          proj.NonKeyAttributes = g.nonKeyAttrs.split(',').map(s => s.trim()).filter(Boolean);
        }
        const idx = { IndexName: g.indexName, KeySchema: ks, Projection: proj };
        if (this.billingMode === 'PROVISIONED') {
          idx.ProvisionedThroughput = { ReadCapacityUnits: Number(g.rcu), WriteCapacityUnits: Number(g.wcu) };
        }
        return idx;
      });
    }

    if (this.lsi.length > 0) {
      payload.LocalSecondaryIndexes = this.lsi.map(l => {
        const ks = [
          { AttributeName: this.pk.name, KeyType: 'HASH' },
          { AttributeName: l.sk.name, KeyType: 'RANGE' },
        ];
        const proj = { ProjectionType: l.projectionType };
        if (l.projectionType === 'INCLUDE' && l.nonKeyAttrs) {
          proj.NonKeyAttributes = l.nonKeyAttrs.split(',').map(s => s.trim()).filter(Boolean);
        }
        return { IndexName: l.indexName, KeySchema: ks, Projection: proj };
      });
    }

    if (this.streamEnabled) {
      payload.StreamSpecification = { StreamEnabled: true, StreamViewType: this.streamViewType };
    }

    return payload;
  },

  async submit() {
    this.error = null;
    this.submitting = true;
    try {
      const payload = this.buildPayload();
      await globalThis.floci.requestJson('/dynamodb/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      window.location.href = '/dynamodb';
    } catch (e) {
      this.error = globalThis.floci.errorMessage(e);
      this.submitting = false;
    }
  },
}`
