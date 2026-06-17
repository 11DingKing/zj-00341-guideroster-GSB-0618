const db = require("../config/database");

function nextId(name) {
  const key = name + "Id";
  const current = db.get(`counters.${key}`).value() || 0;
  const next = current + 1;
  db.set(`counters.${key}`, next).write();
  return next;
}

function nowISO() {
  return new Date().toISOString();
}

function sj(obj, fields) {
  if (!fields || !obj) return obj;
  const out = { ...obj };
  for (const f of fields) {
    if (out[f] !== undefined && typeof out[f] !== "string" && out[f] !== null) {
      out[f] = JSON.stringify(out[f]);
    }
  }
  return out;
}
function pj(obj, fields) {
  if (!fields || !obj) return obj;
  const out = { ...obj };
  for (const f of fields) {
    if (typeof out[f] === "string") {
      try {
        out[f] = JSON.parse(out[f]);
      } catch (e) {}
    }
  }
  return out;
}

function looserEq(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined)
    return false;
  const aNum =
    typeof a === "number"
      ? a
      : typeof a === "string" && a !== "" && Number.isFinite(Number(a))
        ? Number(a)
        : NaN;
  const bNum =
    typeof b === "number"
      ? b
      : typeof b === "string" && b !== "" && Number.isFinite(Number(b))
        ? Number(b)
        : NaN;
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum === bNum;
  return false;
}

const Op = {
  eq: Symbol("eq"),
  ne: Symbol("ne"),
  gte: Symbol("gte"),
  lte: Symbol("lte"),
  like: Symbol("like"),
  between: Symbol("between"),
  in: Symbol("in"),
  or: Symbol("or"),
  and: Symbol("and"),
};

function isSymObj(v) {
  return (
    v &&
    typeof v === "object" &&
    Object.getOwnPropertySymbols(v).length > 0 &&
    Object.keys(v).length === 0
  );
}

function makeModel(tableName, idName, jsonFields = []) {
  const model = {
    tableName,
    jsonFields,
    findAll(query = {}) {
      let arr = db.get(tableName).value() || [];
      arr = arr.map((r) => pj(r, jsonFields));
      if (query.where) {
        const w = query.where;
        for (const [k, v] of Object.entries(w)) {
          if (v === null || v === undefined || k === Op.or) continue;
          if (isSymObj(v)) {
            if (v[Op.eq] !== undefined)
              arr = arr.filter((x) => looserEq(x[k], v[Op.eq]));
            else if (v[Op.ne] !== undefined)
              arr = arr.filter((x) => !looserEq(x[k], v[Op.ne]));
            else if (v[Op.like] !== undefined) {
              const pat = v[Op.like].replace(/%/g, "");
              arr = arr.filter((x) => String(x[k] || "").includes(pat));
            } else if (v[Op.gte] !== undefined)
              arr = arr.filter((x) => x[k] >= v[Op.gte]);
            else if (v[Op.lte] !== undefined)
              arr = arr.filter((x) => x[k] <= v[Op.lte]);
            else if (v[Op.between] !== undefined) {
              const [lo, hi] = v[Op.between];
              arr = arr.filter((x) => x[k] >= lo && x[k] <= hi);
            } else if (v[Op.in] !== undefined)
              arr = arr.filter((x) =>
                v[Op.in].some((iv) => looserEq(x[k], iv)),
              );
          } else {
            arr = arr.filter((x) => looserEq(x[k], v));
          }
        }
        if (w[Op.or]) {
          const ors = w[Op.or];
          arr = arr.filter((x) =>
            ors.some((cond) => {
              for (const [k, v] of Object.entries(cond)) {
                if (isSymObj(v)) {
                  if (v[Op.like] !== undefined) {
                    if (
                      !String(x[k] || "").includes(v[Op.like].replace(/%/g, ""))
                    )
                      return false;
                  } else if (v[Op.in] !== undefined) {
                    if (!v[Op.in].some((iv) => looserEq(x[k], iv)))
                      return false;
                  } else if (v[Op.eq] !== undefined) {
                    if (!looserEq(x[k], v[Op.eq])) return false;
                  }
                } else if (!looserEq(x[k], v)) return false;
              }
              return true;
            }),
          );
        }
      }
      if (query.order) {
        for (const [f, d] of [...query.order].reverse()) {
          arr.sort(
            (a, b) =>
              (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0) * (d === "ASC" ? 1 : -1),
          );
        }
      }
      return arr;
    },
    findOne(q) {
      return this.findAll(q)[0] || null;
    },
    findByPk(id) {
      const r = db
        .get(tableName)
        .find({ [idName]: Number(id) })
        .value();
      return r ? pj(r, jsonFields) : null;
    },
    count(q) {
      return this.findAll({ where: q && q.where }).length;
    },
    bulkCreate(items) {
      return items.map((data) => {
        const id = nextId(tableName);
        const rec = sj(
          { [idName]: id, ...data, createdAt: nowISO(), updatedAt: nowISO() },
          jsonFields,
        );
        db.get(tableName).push(rec).write();
        return pj(rec, jsonFields);
      });
    },
    create(data) {
      return this.bulkCreate([data])[0];
    },
    update(id, patch) {
      const f = db.get(tableName).find({ [idName]: Number(id) });
      if (!f.value()) return null;
      f.assign(sj({ ...patch, updatedAt: nowISO() }, jsonFields)).write();
      return pj(f.value(), jsonFields);
    },
    destroy(id) {
      const b = db.get(tableName).size().value();
      db.get(tableName)
        .remove({ [idName]: Number(id) })
        .write();
      return b !== db.get(tableName).size().value();
    },
  };
  return model;
}

function pick(obj, attrs) {
  if (!obj || !attrs) return obj;
  const out = {};
  for (const k of attrs) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

module.exports = { makeModel, Op, nextId, nowISO, pick, db };
