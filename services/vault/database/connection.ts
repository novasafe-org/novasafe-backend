// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const config_1 = require("../config/config");
const logger_1 = __importDefault(require("../src/logger"));
const pools = {};
class Database {
    constructor(serviceName) {
        this.serviceName = serviceName;
        this.connect();
    }
    async connect() {
        const config = config_1.DBCONFIG[this.serviceName];
        if (!config) {
            throw new Error(`Database configuration for service '${this.serviceName}' not found.`);
        }
        if (!config.uri || typeof config.uri !== 'string') {
            throw new Error(`Invalid or missing 'uri' in database configuration for service '${this.serviceName}'.`);
        }
        if (pools[this.serviceName]) {
            this.dbConnection = pools[this.serviceName];
            return;
        }
        if (config.type !== 'mongodb') {
            throw new Error(`Unsupported database type '${config.type}' for service '${this.serviceName}'. Only MongoDB is supported.`);
        }
        logger_1.default.debug('Connecting to MongoDB...');
        const clientOptions = {
            retryWrites: true,
            retryReads: true,
            family: 4,
            compressors: ['snappy', 'zlib'],
        };
        try {
            const client = new mongodb_1.MongoClient(config.uri, clientOptions);
            await client.connect();
            await client.db('admin').command({ ping: 1 });
            pools[this.serviceName] = client.db(config.databaseName);
            this.dbConnection = pools[this.serviceName];
            logger_1.default.info(`Database connected ✅`);
        }
        catch (error) {
            logger_1.default.error(`MongoDB connection failed ❌`);
            throw error;
        }
    }
    getDb() {
        if (!this.dbConnection) {
            throw new Error('Database connection is not established. Call connect() first.');
        }
        return this.dbConnection;
    }
    async insertOne(collectionName, data) {
        const db = this.getDb();
        return db.collection(collectionName).insertOne(data);
    }
    async insertMany(collectionName, data) {
        const db = this.getDb();
        return db.collection(collectionName).insertMany(data);
    }
    async findOne(collectionName, query) {
        const db = this.getDb();
        return db.collection(collectionName).findOne(query);
    }
    async findMany(collectionName, query, options) {
        const db = this.getDb();
        let cursor = db.collection(collectionName).find(query);
        if (options?.sort) {
            cursor = cursor.sort(options.sort);
        }
        if (options?.skip) {
            cursor = cursor.skip(options.skip);
        }
        if (options?.limit) {
            cursor = cursor.limit(options.limit);
        }
        return cursor.toArray();
    }
    async updateOne(collectionName, filter, update) {
        const db = this.getDb();
        return db.collection(collectionName).updateOne(filter, update);
    }
    async updateMany(collectionName, filter, update) {
        const db = this.getDb();
        return db.collection(collectionName).updateMany(filter, update);
    }
    async deleteOne(collectionName, filter) {
        const db = this.getDb();
        return db.collection(collectionName).updateOne(filter, { $set: { deleted: true } });
    }
    async deleteMany(collectionName, filter) {
        const db = this.getDb();
        return db.collection(collectionName).deleteMany(filter);
    }
}
exports.default = Database;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export default __cjs_exports.default;
