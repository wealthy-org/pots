CREATE TABLE "chat_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chat_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"wallet" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_wallet_check" CHECK ("chat_messages"."wallet" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "chat_messages_body_check" CHECK (char_length("chat_messages"."body") between 1 and 280)
);
--> statement-breakpoint
CREATE TABLE "keeper_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "keeper_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"round_id" text,
	"phase" text,
	"alerts" text[] DEFAULT '{}'::text[] NOT NULL,
	"failed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"http_status" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"wallet" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"nickname_lower" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_wallet_check" CHECK ("profiles"."wallet" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "profiles_nickname_check" CHECK ("profiles"."nickname" ~ '^[A-Za-z0-9_]{3,16}$')
);
--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_wallet_created_at_idx" ON "chat_messages" USING btree ("wallet","created_at");--> statement-breakpoint
CREATE INDEX "keeper_events_created_at_idx" ON "keeper_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_nickname_lower_idx" ON "profiles" USING btree ("nickname_lower");