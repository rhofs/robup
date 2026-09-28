-- AlterTable
ALTER TABLE "DeviceToken" ADD COLUMN "last_error" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "last_error_at" DATETIME;
ALTER TABLE "DeviceToken" ADD COLUMN "last_sent_at" DATETIME;

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "last_error" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "last_error_at" DATETIME;
ALTER TABLE "PushSubscription" ADD COLUMN "last_sent_at" DATETIME;
