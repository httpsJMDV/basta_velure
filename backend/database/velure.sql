-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: velure
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `addresses`
--

DROP TABLE IF EXISTS `addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `addresses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floor_unit` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `district` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ward` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` enum('home','office') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'home',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `addresses_user_id_index` (`user_id`),
  CONSTRAINT `addresses_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `addresses`
--

LOCK TABLES `addresses` WRITE;
/*!40000 ALTER TABLE `addresses` DISABLE KEYS */;
INSERT INTO `addresses` VALUES (1,2,'Jay Mark Del Valle','+639694089045','Purok 6, Kanduli Str.',NULL,'Laguna','Santa Cruz','Santo Angel Norte','home',1,'2026-08-19 00:06:51','2026-08-19 00:06:51'),(3,6,'Sammuel Jackson','+639686786989','Purok 9, Brgy Pitipiw wiw wiw Str.',NULL,'Agusan Del Norte','Jabonga','San Vicente','home',1,'2026-08-19 00:19:21','2026-08-19 00:19:57'),(4,2,'Jay Mark Del Valle','+639694089045','Purok 6, Pitipiwpiwwiwwiw Str.',NULL,'Laguna','Santa Cruz','Santo Angel Norte','home',1,'2026-08-19 01:04:54','2026-08-19 01:04:54'),(5,7,'Rafael delvalle','+639768978079','Purok 8, Pitipiwpiw wiw wiw Str.',NULL,'Tawi-Tawi','Languyan','Tumahubong','home',1,'2026-08-19 03:40:50','2026-08-19 03:40:50');
/*!40000 ALTER TABLE `addresses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `admin_activity_logs`
--

DROP TABLE IF EXISTS `admin_activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_activity_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `admin_id` bigint unsigned NOT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` bigint unsigned NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `meta` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `admin_activity_logs_admin_id_index` (`admin_id`),
  KEY `admin_activity_logs_target_type_target_id_index` (`target_type`,`target_id`),
  KEY `admin_activity_logs_action_index` (`action`),
  KEY `admin_activity_logs_created_at_index` (`created_at`),
  CONSTRAINT `admin_activity_logs_admin_id_foreign` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_activity_logs`
--

LOCK TABLES `admin_activity_logs` WRITE;
/*!40000 ALTER TABLE `admin_activity_logs` DISABLE KEYS */;
INSERT INTO `admin_activity_logs` VALUES (1,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:39'),(2,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:42'),(3,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:52'),(4,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:53'),(5,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:54'),(6,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:55'),(7,1,'suspend_user','user',7,'Suspended buyer account: arpiedelvalle.1978@gmail.com.','{\"role\": \"buyer\", \"email\": \"arpiedelvalle.1978@gmail.com\"}','2026-08-19 04:17:33'),(8,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:29:02'),(9,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:30:39'),(10,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:30:44'),(11,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:30:49'),(12,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:31:25'),(13,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:31:33'),(14,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:31:38'),(15,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:34:39'),(16,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:34:47'),(17,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:37:49'),(18,1,'reactivate_user','user',4,'Reactivated buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:54:00'),(19,1,'suspend_user','user',2,'Suspended buyer account: jaymarkdelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"jaymarkdelvalle42@gmail.com\"}','2026-08-19 04:54:03'),(20,1,'reactivate_user','user',2,'Reactivated buyer account: jaymarkdelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"jaymarkdelvalle42@gmail.com\"}','2026-08-19 05:37:35');
/*!40000 ALTER TABLE `admin_activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache`
--

DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache`
--

LOCK TABLES `cache` WRITE;
/*!40000 ALTER TABLE `cache` DISABLE KEYS */;
INSERT INTO `cache` VALUES ('velure-cache-6a3e6c626eb6b6da16a46ad85aec5c94','i:1;',1787139709),('velure-cache-6a3e6c626eb6b6da16a46ad85aec5c94:timer','i:1787139709;',1787139709),('velure-cache-e45444ecc678a271a6330f468a373360','i:1;',1787145703),('velure-cache-e45444ecc678a271a6330f468a373360:timer','i:1787145703;',1787145703);
/*!40000 ALTER TABLE `cache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache_locks`
--

DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` bigint NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache_locks`
--

LOCK TABLES `cache_locks` WRITE;
/*!40000 ALTER TABLE `cache_locks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_locks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversations`
--

DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `seller_id` bigint unsigned NOT NULL,
  `last_message_at` timestamp NULL DEFAULT NULL,
  `admin_unread` int unsigned NOT NULL DEFAULT '0',
  `seller_unread` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversations_seller_id_unique` (`seller_id`),
  KEY `conversations_last_message_at_index` (`last_message_at`),
  CONSTRAINT `conversations_seller_id_foreign` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
/*!40000 ALTER TABLE `conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `disputes`
--

DROP TABLE IF EXISTS `disputes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `disputes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `buyer_id` bigint unsigned NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('open','in_progress','resolved','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `resolution_note` text COLLATE utf8mb4_unicode_ci,
  `resolved_by` bigint unsigned DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `disputes_buyer_id_foreign` (`buyer_id`),
  KEY `disputes_resolved_by_foreign` (`resolved_by`),
  KEY `disputes_status_index` (`status`),
  KEY `disputes_order_id_index` (`order_id`),
  CONSTRAINT `disputes_buyer_id_foreign` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `disputes_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `disputes_resolved_by_foreign` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `disputes`
--

LOCK TABLES `disputes` WRITE;
/*!40000 ALTER TABLE `disputes` DISABLE KEYS */;
/*!40000 ALTER TABLE `disputes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `failed_jobs`
--

DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`),
  KEY `failed_jobs_connection_queue_failed_at_index` (`connection`,`queue`,`failed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `failed_jobs`
--

LOCK TABLES `failed_jobs` WRITE;
/*!40000 ALTER TABLE `failed_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `failed_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_batches`
--

DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_batches`
--

LOCK TABLES `job_batches` WRITE;
/*!40000 ALTER TABLE `job_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` smallint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
INSERT INTO `jobs` VALUES (1,'default','{\"uuid\":\"1795b13a-335c-4c8e-af0d-ad4125087056\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:3;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:25:\\\"fakerdelvalle22@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1786575377,\"delay\":null}',0,NULL,1786575377,1786575377),(2,'default','{\"uuid\":\"b8fac4ac-78c6-4e82-8b5a-dcbb46ffb415\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:4;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:26:\\\"legenddelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1786609209,\"delay\":null}',0,NULL,1786609209,1786609209),(3,'default','{\"uuid\":\"7b7d2575-1071-4791-a01a-2cac25d03188\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:5;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:25:\\\"carlanderson22k@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787023688,\"delay\":null}',0,NULL,1787023688,1787023688),(4,'default','{\"uuid\":\"e6d8901a-40af-46c1-a7a5-8e052ad03587\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:6;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"sammueldelvalle22@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787023710,\"delay\":null}',0,NULL,1787023710,1787023710),(5,'default','{\"uuid\":\"0c7c570c-4725-4379-8e49-a1f30a9fee47\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:7;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:28:\\\"arpiedelvalle.1978@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787024960,\"delay\":null}',0,NULL,1787024960,1787024960),(6,'default','{\"uuid\":\"f2a3a6ab-6968-4124-acd4-35bd616f7f30\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:8;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:24:\\\"romulojules123@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787128534,\"delay\":null}',0,NULL,1787128534,1787128534),(7,'default','{\"uuid\":\"2ed610f4-05e8-4184-9d48-4d8ba2dc3511\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:9;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:25:\\\"andrewespino478@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787129723,\"delay\":null}',0,NULL,1787129723,1787129723),(8,'default','{\"uuid\":\"4b2c6bb7-d3ce-476d-9274-2de5bcd865ca\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:10;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:22:\\\"bboi.1234.15@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787129985,\"delay\":null}',0,NULL,1787129985,1787129985);
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint unsigned NOT NULL,
  `sender_id` bigint unsigned NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `messages_sender_id_foreign` (`sender_id`),
  KEY `messages_conversation_id_created_at_index` (`conversation_id`,`created_at`),
  CONSTRAINT `messages_conversation_id_foreign` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_sender_id_foreign` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_08_12_164340_create_personal_access_tokens_table',1),(5,'2026_08_12_164525_create_seller_profiles_table',1),(6,'2026_08_12_193559_make_phone_nullable_on_users_table',2),(7,'2026_08_12_193600_create_sessions_table',3),(8,'2026_08_12_210056_add_profile_fields_to_users_table',4),(9,'2026_08_12_210343_create_addresses_table',5),(10,'2026_08_12_215517_add_avatar_to_users_table',6),(11,'2026_08_12_224456_create_admin_activity_logs_table',7),(12,'2026_08_13_000001_add_shop_fields_to_seller_profiles_table',8),(13,'2026_08_13_100000_create_orders_payments_disputes_reviews_tables',9),(14,'2026_08_14_000001_create_conversations_messages_tables',10),(15,'2026_08_18_031238_add_buyer_fields_to_users_table',11),(16,'2026_08_18_055831_alter_sex_enum_on_users_table',12),(17,'2026_08_18_055925_drop_gender_column_from_users_table',13),(18,'2026_08_19_000001_add_business_permit_to_seller_profiles_table',14),(19,'2026_08_19_100000_add_government_id_back_to_users_table',14);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `seller_id` bigint unsigned NOT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `order_items_order_id_index` (`order_id`),
  KEY `order_items_seller_id_index` (`seller_id`),
  CONSTRAINT `order_items_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_seller_id_foreign` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `buyer_id` bigint unsigned NOT NULL,
  `order_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `shipping_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total` decimal(12,2) NOT NULL,
  `payment_method` enum('gcash','cod') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_status` enum('pending','paid','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `status` enum('pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_order_number_unique` (`order_number`),
  KEY `orders_buyer_id_index` (`buyer_id`),
  KEY `orders_status_index` (`status`),
  KEY `orders_created_at_index` (`created_at`),
  CONSTRAINT `orders_buyer_id_foreign` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint unsigned NOT NULL,
  `method` enum('gcash','cod') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` enum('pending','paid','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `payments_order_id_index` (`order_id`),
  KEY `payments_status_index` (`status`),
  CONSTRAINT `payments_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenable_id` bigint unsigned NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text COLLATE utf8mb4_unicode_ci,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
INSERT INTO `personal_access_tokens` VALUES (4,'App\\Models\\User',3,'auth_token','14dba466a9b4bca9bc04b476efc7e8231a4ad0bca416951ee6429649f0b0f51a','[\"*\"]','2026-08-12 14:56:17',NULL,'2026-08-12 14:56:17','2026-08-12 14:56:17'),(5,'App\\Models\\User',1,'auth_token','cda4cdf93e4e87476ed92274f63ab83e87270d84b92e1007a6122bde9b43ee00','[\"*\"]','2026-08-12 15:05:59',NULL,'2026-08-12 14:58:08','2026-08-12 15:05:59'),(7,'App\\Models\\User',1,'auth_token','67aeb819807d98acf89fae52ad4140b42881ed5e05e2723efca4d956afc53499','[\"*\"]','2026-08-12 23:53:27',NULL,'2026-08-12 23:45:11','2026-08-12 23:53:27'),(12,'App\\Models\\User',1,'auth_token','d2485c9939e9403072dd69201e3c94d86b01dcb639b809215a32852bd4b2d7e2','[\"*\"]','2026-08-13 05:51:37',NULL,'2026-08-13 04:59:34','2026-08-13 05:51:37'),(14,'App\\Models\\User',1,'auth_token','89a84dd566eac9d2359641d425ced33bbf165d1dc6753596b365534c5f4f8904','[\"*\"]','2026-08-13 06:29:41',NULL,'2026-08-13 06:23:07','2026-08-13 06:29:41'),(16,'App\\Models\\User',1,'auth_token','e403e7257a0c0a3fb083980ee80afe72c6e1ec7b4401acd9c034c29222003b89','[\"*\"]','2026-08-13 08:16:35',NULL,'2026-08-13 07:02:41','2026-08-13 08:16:35'),(17,'App\\Models\\User',1,'auth_token','4f067dd041683162974228cd9a9744fff7d887cbe7cdbdd6244f19b5def5f642','[\"*\"]','2026-08-13 09:06:13',NULL,'2026-08-13 08:16:46','2026-08-13 09:06:13'),(18,'App\\Models\\User',1,'auth_token','46a6ca7f5e79d334cc63016d49894e589aaef121f1b1e358b502486e01c55c64','[\"*\"]','2026-08-15 04:19:39',NULL,'2026-08-15 04:19:36','2026-08-15 04:19:39'),(20,'App\\Models\\User',1,'auth_token','2c0dffde9b83e8d59a8d0e3fd693151401d89f53bd8115bc817239621e953262','[\"*\"]','2026-08-16 13:50:30',NULL,'2026-08-15 04:58:17','2026-08-16 13:50:30'),(21,'App\\Models\\User',1,'auth_token','53475b724fb5831f724328b8b0dbea6d22794fb82aba25b1921fc2dc549df7dd','[\"*\"]','2026-08-17 18:22:00',NULL,'2026-08-16 15:00:36','2026-08-17 18:22:00'),(23,'App\\Models\\User',5,'auth_token','e9c560119ae74c3829e27bf84a1e0fc018ae40d013376d3c95d88bc8005ea878','[\"*\"]','2026-08-17 19:28:09',NULL,'2026-08-17 19:28:08','2026-08-17 19:28:09'),(24,'App\\Models\\User',6,'auth_token','c2f52793145a2fb237d1275f7cb03e0fdabd593217acf087fbe89e115ab6d394','[\"*\"]','2026-08-17 19:28:30',NULL,'2026-08-17 19:28:30','2026-08-17 19:28:30'),(25,'App\\Models\\User',6,'auth_token','b6ff7fa8222408c9a2cd6217a273ef832dc6dfca12c111f1c263faf2e1d9cf24','[\"*\"]','2026-08-17 19:49:09',NULL,'2026-08-17 19:49:09','2026-08-17 19:49:09'),(26,'App\\Models\\User',7,'auth_token','187e4dd6d06f2c6c4bd1b7a8f24a48777becd0fa39b4a87cb750b9b32ff6f7e0','[\"*\"]','2026-08-17 19:51:52',NULL,'2026-08-17 19:49:20','2026-08-17 19:51:52'),(30,'App\\Models\\User',1,'auth_token','332e772dbc4b32d7acb8d0e42eb67a744025f3d32d77a8ad87649cdc0aff0550','[\"*\"]','2026-08-18 20:29:01',NULL,'2026-08-18 18:59:33','2026-08-18 20:29:01'),(32,'App\\Models\\User',1,'auth_token','63688c9fbe6261fc8d5dcc1480702af8474918789bafcd7daa4efd49db1885f8','[\"*\"]','2026-08-18 20:43:32',NULL,'2026-08-18 20:29:29','2026-08-18 20:43:32'),(36,'App\\Models\\User',1,'auth_token','46cd1a1edb4449a6f9d647a845c8a7ecff1557ff8170a674cd5f694b28ab07bd','[\"*\"]','2026-08-18 20:54:03',NULL,'2026-08-18 20:51:17','2026-08-18 20:54:03'),(37,'App\\Models\\User',1,'auth_token','b46c2177b0561756c04e376e234c9ddaebcd2b51916153bdb2d424cd86c16048','[\"*\"]','2026-08-18 23:44:33',NULL,'2026-08-18 20:54:55','2026-08-18 23:44:33'),(38,'App\\Models\\User',2,'auth_token','a6ba4a482717cc46abb5628a395f2f43ac24a99f435ada842bdfc2b823b9db79','[\"*\"]','2026-08-18 23:56:25',NULL,'2026-08-18 23:44:42','2026-08-18 23:56:25'),(39,'App\\Models\\User',2,'auth_token','5d7b93f18ed39b8e2462dc9131216b33631831d9bfad38183eb1e60ae959dd8a','[\"*\"]','2026-08-19 00:07:26',NULL,'2026-08-19 00:05:23','2026-08-19 00:07:26'),(40,'App\\Models\\User',2,'auth_token','cb4ce497ebe203c1cda7f2a88071ee84c4a78e58aa85dbd356ae1a479c58a8e3','[\"*\"]','2026-08-19 00:13:38',NULL,'2026-08-19 00:13:38','2026-08-19 00:13:38'),(41,'App\\Models\\User',6,'auth_token','0a8e59491cef725f3d6c87c66bb0fa4b8dcd0f0d838c5f509d5f2f4279b3115f','[\"*\"]','2026-08-19 00:22:52',NULL,'2026-08-19 00:14:47','2026-08-19 00:22:52'),(42,'App\\Models\\User',4,'auth_token','853a3323679051596e40df3b15ec73ad354f45329e7d050dc211a81b5ff62b83','[\"*\"]','2026-08-19 00:25:15',NULL,'2026-08-19 00:25:14','2026-08-19 00:25:15'),(43,'App\\Models\\User',6,'auth_token','c6458b4113b064c165a12448d49369b0c17883471663a5b1c17dfa65b3a806b3','[\"*\"]','2026-08-19 00:30:54',NULL,'2026-08-19 00:30:53','2026-08-19 00:30:54'),(44,'App\\Models\\User',4,'auth_token','3fe1d12c9731ce3a2e86474a453ff655945d18838d660c91426a95178c50433d','[\"*\"]','2026-08-19 00:31:04',NULL,'2026-08-19 00:31:03','2026-08-19 00:31:04'),(45,'App\\Models\\User',4,'auth_token','e1e4355a9969e18230b63eb8f36782b2e0a66099913311f793a2186cdbda43b3','[\"*\"]','2026-08-19 00:32:23',NULL,'2026-08-19 00:32:22','2026-08-19 00:32:23'),(46,'App\\Models\\User',8,'auth_token','67264a76ba7ddbebd8c7a8eb874d4c597b2b7e2c564297d021a7cbdc3add0cc8','[\"*\"]','2026-08-19 00:35:34',NULL,'2026-08-19 00:35:34','2026-08-19 00:35:34'),(47,'App\\Models\\User',8,'auth_token','7e45b38945b03619433174f55d28ba5905d5e4676c3e6c49b9ad68ea20b28094','[\"*\"]','2026-08-19 00:48:35',NULL,'2026-08-19 00:48:33','2026-08-19 00:48:35'),(48,'App\\Models\\User',5,'auth_token','655bf03a25d6d889c66759e793a4133710aa3119927ee9bc0e198dd868aa7cca','[\"*\"]',NULL,NULL,'2026-08-19 00:48:54','2026-08-19 00:48:54'),(49,'App\\Models\\User',5,'auth_token','eea000ddc5693323ed1ac936f5088e3396574464a06d9cce261d6aa7614f2002','[\"*\"]',NULL,NULL,'2026-08-19 00:49:03','2026-08-19 00:49:03'),(50,'App\\Models\\User',5,'auth_token','c809aea115f6c361a2a7155324daed2755e4fb9dff73e464ace8355ea7160bb2','[\"*\"]',NULL,NULL,'2026-08-19 00:49:12','2026-08-19 00:49:12'),(51,'App\\Models\\User',5,'auth_token','ab61a5a04f352c9a63c481407431ad8302a4e8aa1b1a55f5ab73205383fc9b4e','[\"*\"]',NULL,NULL,'2026-08-19 00:50:50','2026-08-19 00:50:50'),(52,'App\\Models\\User',2,'auth_token','f836194c557f8fc449f5038264748f6a657f0839a0ab84bac45d6b7f98a8adae','[\"*\"]',NULL,NULL,'2026-08-19 00:50:58','2026-08-19 00:50:58'),(53,'App\\Models\\User',2,'auth_token','a4c06c43a0a4500a399bd4f872a5d9f50235d799ad005e44c9585e72b36ec925','[\"*\"]',NULL,NULL,'2026-08-19 00:51:16','2026-08-19 00:51:16'),(54,'App\\Models\\User',5,'auth_token','ea48f2ac84b3957b13acb606ecdb8d740ab4ae54f3b7a9cc962c16b125a46d16','[\"*\"]',NULL,NULL,'2026-08-19 00:52:44','2026-08-19 00:52:44'),(55,'App\\Models\\User',8,'auth_token','8c53c601d0966473f6b89d3c4bacf2dd43bc2d26fce95469f6aecd6ae9102320','[\"*\"]',NULL,NULL,'2026-08-19 00:52:58','2026-08-19 00:52:58'),(56,'App\\Models\\User',2,'auth_token','70a7ecb45d4938d067d116ddd0d3eefa51afe14025823a4956bb81d4dc124f07','[\"*\"]',NULL,NULL,'2026-08-19 00:53:47','2026-08-19 00:53:47'),(57,'App\\Models\\User',2,'auth_token','e2066633a377ba7e27c9d56baf6aaaa2449beb2bca6e800cd97ad260e7a5988c','[\"*\"]','2026-08-19 00:54:54',NULL,'2026-08-19 00:54:54','2026-08-19 00:54:54'),(58,'App\\Models\\User',9,'auth_token','1a5b92b6a04041ecbb500a9b63e12dd5df46cfc0505ae0d946d600994a920a64','[\"*\"]','2026-08-19 00:55:39',NULL,'2026-08-19 00:55:23','2026-08-19 00:55:39'),(59,'App\\Models\\User',10,'auth_token','8e990b95a257f14603ad8e57e4c7c9e148b035752ff1b6583fa973d1830c0acf','[\"*\"]','2026-08-19 00:59:51',NULL,'2026-08-19 00:59:45','2026-08-19 00:59:51'),(60,'App\\Models\\User',10,'auth_token','7d2b1a32244345f162811249d377300800e76fa40309b42cf63a3a2694279c32','[\"*\"]','2026-08-19 01:01:20',NULL,'2026-08-19 01:01:20','2026-08-19 01:01:20'),(61,'App\\Models\\User',10,'auth_token','78c125b49859bafb9d37114a088a59f8f6c4caeab2262edb27476c5af73b934a','[\"*\"]','2026-08-19 01:01:28',NULL,'2026-08-19 01:01:27','2026-08-19 01:01:28'),(62,'App\\Models\\User',2,'auth_token','0797e2a0844b2031706c91d81ea3206a8f469a622b3f1ab9a1eb9110b209c681','[\"*\"]','2026-08-19 01:04:54',NULL,'2026-08-19 01:03:51','2026-08-19 01:04:54'),(63,'App\\Models\\User',1,'auth_token','bd85207a30ae1f597af070782563416ef7e622b180895fa73a8fc3b619daf03c','[\"*\"]','2026-08-19 03:15:32',NULL,'2026-08-19 01:05:42','2026-08-19 03:15:32'),(64,'App\\Models\\User',2,'auth_token','ef21f8f4dc0ea1a267025da7372241b3acef29c0e52cf825b28727f0772e6daf','[\"*\"]','2026-08-19 03:17:10',NULL,'2026-08-19 03:17:10','2026-08-19 03:17:10'),(65,'App\\Models\\User',1,'auth_token','9361152528a629b272d38c98e35232b98c5dc2911131862955914787b0ab0741','[\"*\"]','2026-08-19 03:28:30',NULL,'2026-08-19 03:25:01','2026-08-19 03:28:30'),(66,'App\\Models\\User',2,'auth_token','8e8a47a2fa84f219c2e569fc56c9c4e69a91fb7d1f4c7879f7934c6752d0a6a0','[\"*\"]','2026-08-19 03:29:06',NULL,'2026-08-19 03:29:02','2026-08-19 03:29:06'),(67,'App\\Models\\User',1,'auth_token','27b3645ec1ca0887ce5ec37fddb90c2f756369e16508eb4f9bd4aa2f7f1acfc7','[\"*\"]','2026-08-19 03:30:07',NULL,'2026-08-19 03:29:29','2026-08-19 03:30:07'),(68,'App\\Models\\User',6,'auth_token','4a0129e7c492774d6bfeb071a23cdfa7f8e6c291f77f4658f0860d2835fd87ab','[\"*\"]','2026-08-19 03:30:33',NULL,'2026-08-19 03:30:33','2026-08-19 03:30:33'),(69,'App\\Models\\User',7,'auth_token','a05a98a25a168c261ad2972dd1c7ea7452966bac411d024b2e8103f612add561','[\"*\"]','2026-08-19 03:39:15',NULL,'2026-08-19 03:30:44','2026-08-19 03:39:15'),(70,'App\\Models\\User',7,'auth_token','a672e1dcb0cd4ba08bb9e5f55daeefcb27d5e58eeb28dbc0eb680d69d7becbf8','[\"*\"]','2026-08-19 03:40:49',NULL,'2026-08-19 03:39:37','2026-08-19 03:40:49'),(71,'App\\Models\\User',1,'auth_token','eb1d7834a02099a273c3afc15138b20a7a8334cdca72384c11a8d6950f88fbca','[\"*\"]','2026-08-19 03:59:10',NULL,'2026-08-19 03:41:34','2026-08-19 03:59:10'),(72,'App\\Models\\User',1,'auth_token','0d7bec167796fc3d5f2c3986029ace193651986dd3e953732c8f15671d2e0bb7','[\"*\"]','2026-08-19 05:03:15',NULL,'2026-08-19 04:01:20','2026-08-19 05:03:15'),(73,'App\\Models\\User',3,'auth_token','292a2477dca6b9ed8fcee8e8648acf53f0c2f47350efbd7a4cef8f8ab3381913','[\"*\"]','2026-08-19 05:03:30',NULL,'2026-08-19 05:03:29','2026-08-19 05:03:30'),(74,'App\\Models\\User',1,'auth_token','829993fded49faf2ad400e6e80b5df11b55817dd3afe2b1154479a34808c8949','[\"*\"]','2026-08-19 05:22:52',NULL,'2026-08-19 05:20:47','2026-08-19 05:22:52');
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `buyer_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `rating` tinyint NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `verified_purchase` tinyint(1) NOT NULL DEFAULT '0',
  `flagged` tinyint(1) NOT NULL DEFAULT '0',
  `flag_reason` text COLLATE utf8mb4_unicode_ci,
  `moderation_status` enum('visible','hidden','pending_review') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'visible',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reviews_order_id_foreign` (`order_id`),
  KEY `reviews_product_id_index` (`product_id`),
  KEY `reviews_buyer_id_index` (`buyer_id`),
  KEY `reviews_flagged_index` (`flagged`),
  KEY `reviews_moderation_status_index` (`moderation_status`),
  CONSTRAINT `reviews_buyer_id_foreign` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `reviews_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seller_profiles`
--

DROP TABLE IF EXISTS `seller_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seller_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `shop_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shop_category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shop_description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date NOT NULL,
  `government_id_type` enum('national_id','drivers_license','passport','umid','sss_id','philhealth_id','voters_id','postal_id') COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_number` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_number_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_image_back_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `business_permit_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_gcash_number` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `application_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `reviewed_by` bigint unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `seller_profiles_shop_name_unique` (`shop_name`),
  UNIQUE KEY `seller_profiles_government_id_number_hash_unique` (`government_id_number_hash`),
  KEY `seller_profiles_user_id_foreign` (`user_id`),
  KEY `seller_profiles_reviewed_by_foreign` (`reviewed_by`),
  KEY `seller_profiles_application_status_index` (`application_status`),
  CONSTRAINT `seller_profiles_reviewed_by_foreign` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `seller_profiles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_profiles`
--

LOCK TABLES `seller_profiles` WRITE;
/*!40000 ALTER TABLE `seller_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `seller_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES ('bLf0g9ZTaBYD5bLGIbRArXgF9LRl77OYyZfhFPpb',NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 OPR/134.0.0.0','eyJfdG9rZW4iOiIyTzNHQURxTUZPSGd0TENzUkR1UkVlb3lucFBiamVmUnpSNXgyaUt6IiwiX2ZsYXNoIjp7Im9sZCI6W10sIm5ldyI6W119fQ==',1786566454);
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `first_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `middle_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `sex` enum('male','female','prefer_not_to_say') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `government_id_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `government_id_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `government_id_image_back_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `buyer_application_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `buyer_rejection_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','buyer','seller','rider') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'buyer',
  `status` enum('active','suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `verification_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_token_expires_at` timestamp NULL DEFAULT NULL,
  `reset_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reset_token_expires_at` timestamp NULL DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  UNIQUE KEY `users_phone_unique` (`phone`),
  KEY `users_email_index` (`email`),
  KEY `users_phone_index` (`phone`),
  KEY `users_role_index` (`role`),
  KEY `users_status_index` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Velure',NULL,'Admin','admin@gmail.com','+639000000000',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$ODvgcYgpVABm.1JZc1cZ.eWTAMBLnsrX5FXo0LlLKta8ZBBFs3whK','admin','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-12 08:59:54','2026-08-12 14:57:56',NULL),(2,'Jay Mark',NULL,'Del Valle','jaymarkdelvalle42@gmail.com','+639694089045','2005-12-04','male','national_id','buyer-ids/qmk5BEKOHmbYax3LCLspwVe2fpoNJ2ViGWGmV7U9.png',NULL,'pending',NULL,'avatars/1at8lAIObyo0bo1jPUhQFgP4o6i3IfYA0xgDm1YT.jpg','$2y$12$pW6Z3Kq2wxZ61I2BJga13.Br3rMYGdE2VivNo/RdbUS5Eq6OKiQT6','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-12 12:30:16','2026-08-19 01:04:54',NULL),(3,'Faker',NULL,'Delvalle','fakerdelvalle22@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$10lwmq9bx0za6s/dZGT0Yec17MDgqNQ1doR.ZyQO.p3mBpEuRaZEa','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-12 14:56:15','2026-08-12 14:56:15',NULL),(4,'Johnny',NULL,'Sins','legenddelvalle42@gmail.com','+639456456456',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$jELkc.eUeQIfu/CIpqBgy.cPkybvqkT5nxXrbmK9d0cmRq2KktqRq','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-13 00:20:07','2026-08-18 20:54:00',NULL),(5,'Medi',NULL,'Moms','carlanderson22k@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$UphUQOtWiDwQztgSHt3D/uG7VCx4yAB45MYOUdVgoRqd2r6tSZBY2','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-17 19:28:06','2026-08-17 19:28:06',NULL),(6,'Sammuel',NULL,'Del Valle','sammueldelvalle22@gmail.com','+639768679679','1994-04-07','male','national_id','buyer-ids/2swdITIjZy7koVOtbvoK1CHOBwVfJIeO5QBUl8da.png',NULL,'pending',NULL,NULL,'$2y$12$7gqY22BkViBLZ0IhGEH8au5BEjaFQ0mIYMXENm1sSpi1JQ6WmRQmW','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-17 19:28:30','2026-08-19 00:22:52',NULL),(7,'Rafael',NULL,'delvalle','arpiedelvalle.1978@gmail.com','+639768978079','1989-10-15','male','drivers_license','buyer-ids/uFRVL3hldbZ0p1lPRS1U9oYSdp04MdTLcKgOWVUK.png',NULL,'pending',NULL,NULL,'$2y$12$I/VZxrXKg/00l4LyrOMwO.vyGqCWMKYlkQxefYFMTvwNioiGIKx0a','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-17 19:49:20','2026-08-19 03:40:50',NULL),(8,'Romulo, Jules Andrei M.',NULL,'User','romulojules123@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$Vo3Im.BKkqEoy.z/M025z./caiLaSHbOCchXTuxD8hgCT6pXVRKFS','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-19 00:35:32','2026-08-19 00:35:32',NULL),(9,'Andrew',NULL,'Espino','andrewespino478@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$ysUnHSKqfa8XtjbZpxXIM.50ienOj00Wf7F7QtKY6HLj9NDFUgvoS','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-19 00:55:23','2026-08-19 00:55:23',NULL),(10,'BIG',NULL,'Boi','bboi.1234.15@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$gME/J2WT9M4EKX/T3jYs9eXEHrUUMSS7gDdlx8Xo0grOIiplz3zBW','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-19 00:59:45','2026-08-19 00:59:45',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-19 21:29:43
