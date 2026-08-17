import { Schema } from "effect";

const CommandIdSchema = {
	id: Schema.optionalKey(Schema.String),
};

export const PiJsonObjectSchema = Schema.Record(Schema.String, Schema.Json);
export type PiJsonObject = Schema.Schema.Type<typeof PiJsonObjectSchema>;

export const PiCommandSchema = Schema.Union([
	Schema.Struct({
		...CommandIdSchema,
		type: Schema.Literal("prompt"),
		message: Schema.String,
	}),
	Schema.Struct({
		...CommandIdSchema,
		type: Schema.Literal("abort"),
	}),
	Schema.Struct({
		...CommandIdSchema,
		type: Schema.Literal("get_state"),
	}),
	Schema.Struct({
		...CommandIdSchema,
		type: Schema.Literal("set_model"),
		provider: Schema.String,
		modelId: Schema.String,
	}),
	Schema.Struct({
		...CommandIdSchema,
		type: Schema.Literal("get_available_models"),
	}),
]);
export type PiCommand = Schema.Schema.Type<typeof PiCommandSchema>;

export const PiResponseSchema = Schema.Struct({
	type: Schema.Literal("response"),
	id: Schema.String,
	success: Schema.Boolean,
	error: Schema.optionalKey(Schema.String),
	data: Schema.optionalKey(Schema.Union([PiJsonObjectSchema, Schema.Null])),
});
export type PiResponse = Schema.Schema.Type<typeof PiResponseSchema>;

export const PiStateResponseSchema = Schema.Struct({
	sessionId: Schema.optionalKey(Schema.String),
});

export const PiModelSchema = Schema.Struct({
	provider: Schema.String,
	id: Schema.String,
	name: Schema.optionalKey(Schema.String),
});

export const PiModelsResponseSchema = Schema.Struct({
	models: Schema.Array(PiModelSchema),
});

export const PiSDKConfigSchema = Schema.Struct({
	type: Schema.Literal("pi-sdk"),
	cwd: Schema.optionalKey(Schema.String),
	model: Schema.optionalKey(Schema.String),
	piExecutablePath: Schema.optionalKey(Schema.String),
});
