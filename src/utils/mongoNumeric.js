/*
 * Precision-safe integer helpers for values migrated from MySQL BIGINT.
 *
 * Discord IDs and large counters are stored as strings so Node never rounds
 * values above Number.MAX_SAFE_INTEGER. Mongo aggregation expressions convert
 * the strings to Decimal128 only while doing atomic arithmetic.
 */

const { Decimal128 } = require('mongodb');

function integerString(value) {
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || !Number.isInteger(value)) {
			throw new TypeError(`Expected an integer, received ${value}`);
		}
		return String(value);
	}
	if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return value.trim();
	throw new TypeError(`Expected an integer-compatible value, received ${value}`);
}

function decimal(value) {
	return Decimal128.fromString(integerString(value));
}

function fieldAsDecimal(field) {
	return {
		$convert: {
			input: { $ifNull: [`$${field}`, '0'] },
			to: 'decimal',
			onError: Decimal128.fromString('0'),
			onNull: Decimal128.fromString('0'),
		},
	};
}

function addFieldPipeline(field, amount, extraSet = {}) {
	return [
		{
			$set: {
				...extraSet,
				[field]: {
					$toString: {
						$add: [fieldAsDecimal(field), decimal(amount)],
					},
				},
			},
		},
	];
}

exports.integerString = integerString;
exports.decimal = decimal;
exports.fieldAsDecimal = fieldAsDecimal;
exports.toBigInt = (value) => BigInt(integerString(value ?? 0));

exports.add = async function (collection, filter, field, amount, options = {}, extraSet = {}) {
	return collection.updateOne(filter, addFieldPipeline(field, amount, extraSet), options);
};

exports.changeIfAtLeast = async function (
	collection,
	filter,
	field,
	minimum,
	amount,
	options = {},
	extraSet = {}
) {
	return collection.updateOne(
		{
			...filter,
			$expr: { $gte: [fieldAsDecimal(field), decimal(minimum)] },
		},
		addFieldPipeline(field, amount, extraSet),
		options
	);
};

exports.subtractIfEnough = async function (
	collection,
	filter,
	field,
	amount,
	options = {}
) {
	return exports.changeIfAtLeast(collection, filter, field, amount, -BigInt(integerString(amount)), options);
};
