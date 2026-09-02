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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `addresses`
--

LOCK TABLES `addresses` WRITE;
/*!40000 ALTER TABLE `addresses` DISABLE KEYS */;
INSERT INTO `addresses` VALUES (3,6,'Sammuel Jackson','+639686786989','Purok 9, Brgy Pitipiw wiw wiw Str.',NULL,'Agusan Del Norte','Jabonga','San Vicente','home',1,'2026-08-19 00:19:21','2026-08-19 00:19:57'),(4,2,'Jay Mark Del Valle','+639694089045','Purok 6, Pitipiwpiwwiwwiw Str.',NULL,'Laguna','Santa Cruz','Santo Angel Norte','home',1,'2026-08-19 01:04:54','2026-08-19 01:04:54'),(5,7,'Rafael delvalle','+639768978079','Purok 8, Pitipiwpiw wiw wiw Str.',NULL,'Tawi-Tawi','Languyan','Tumahubong','home',1,'2026-08-19 03:40:50','2026-08-19 03:40:50'),(6,3,'Faker Delvalle','+639688678679','Purok 8, Pitipiwpiw wiw wiw Str.',NULL,'Guimaras','Nueva Valencia','Santo Domingo','home',1,'2026-08-19 22:58:32','2026-08-19 22:58:32'),(7,11,'Chito Miranda','+639809091233','Brgy Piti piw piw wiw wiw',NULL,'Capiz','Cuartero','San Antonio','home',1,'2026-08-22 00:50:03','2026-08-22 00:50:03');
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
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_activity_logs`
--

LOCK TABLES `admin_activity_logs` WRITE;
/*!40000 ALTER TABLE `admin_activity_logs` DISABLE KEYS */;
INSERT INTO `admin_activity_logs` VALUES (1,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:39'),(2,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:42'),(3,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:52'),(4,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:53'),(5,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:54'),(6,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-13 15:56:55'),(7,1,'suspend_user','user',7,'Suspended buyer account: arpiedelvalle.1978@gmail.com.','{\"role\": \"buyer\", \"email\": \"arpiedelvalle.1978@gmail.com\"}','2026-08-19 04:17:33'),(8,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:29:02'),(9,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:30:39'),(10,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:30:44'),(11,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:30:49'),(12,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:31:25'),(13,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:31:33'),(14,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:31:38'),(15,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:34:39'),(16,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:34:47'),(17,1,'suspend_user','user',4,'Suspended buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:37:49'),(18,1,'reactivate_user','user',4,'Reactivated buyer account: legenddelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"legenddelvalle42@gmail.com\"}','2026-08-19 04:54:00'),(19,1,'suspend_user','user',2,'Suspended buyer account: jaymarkdelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"jaymarkdelvalle42@gmail.com\"}','2026-08-19 04:54:03'),(20,1,'reactivate_user','user',2,'Reactivated buyer account: jaymarkdelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"jaymarkdelvalle42@gmail.com\"}','2026-08-19 05:37:35'),(21,1,'suspend_user','user',2,'Suspended buyer account: jaymarkdelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"jaymarkdelvalle42@gmail.com\"}','2026-08-20 05:23:10'),(22,1,'reactivate_user','user',2,'Reactivated buyer account: jaymarkdelvalle42@gmail.com.','{\"role\": \"buyer\", \"email\": \"jaymarkdelvalle42@gmail.com\"}','2026-08-20 05:24:27'),(23,1,'approve_buyer','user',2,'Approved buyer application for Jay Mark Del Valle (jaymarkdelvalle42@gmail.com).','{\"email\": \"jaymarkdelvalle42@gmail.com\", \"user_id\": 2}','2026-08-20 05:24:47'),(24,1,'reject_seller','seller_profile',1,'Rejected seller application for shop \"Basta Cellphone\".','{\"reason\": \"basta\", \"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 15:38:44'),(25,1,'reject_seller','seller_profile',1,'Rejected seller application for shop \"Basta Cellphone\".','{\"reason\": \"basta\", \"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 15:47:38'),(26,1,'reject_seller','seller_profile',1,'Rejected seller application for shop \"Basta Cellphone\".','{\"reason\": \"vasdasdawd\", \"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 15:53:14'),(27,1,'reject_seller','seller_profile',1,'Rejected seller application for shop \"Basta Cellphone\".','{\"reason\": \"fdgafgsdfsdf\", \"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 15:54:36'),(28,1,'reject_seller','seller_profile',1,'Rejected seller application for shop \"Basta Cellphone\".','{\"reason\": \"asdfasd\", \"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 15:56:43'),(29,1,'reject_seller','seller_profile',1,'Rejected seller application for shop \"Basta Cellphone\".','{\"reason\": \"gafgdfgsdfgsf\", \"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 16:01:20'),(30,1,'approve_seller','seller_profile',1,'Approved seller application for shop \"Basta Cellphone\".','{\"user_id\": 2, \"shop_name\": \"Basta Cellphone\"}','2026-08-23 16:02:28');
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
INSERT INTO `cache` VALUES ('velure-cache-6a3e6c626eb6b6da16a46ad85aec5c94','i:1;',1788270487),('velure-cache-6a3e6c626eb6b6da16a46ad85aec5c94:timer','i:1788270487;',1788270487),('velure-cache-e45444ecc678a271a6330f468a373360','i:1;',1788348602),('velure-cache-e45444ecc678a271a6330f468a373360:timer','i:1788348602;',1788348602);
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
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` bigint unsigned DEFAULT NULL,
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `requires_fda` tinyint(1) NOT NULL DEFAULT '0',
  `commission_rate` decimal(5,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categories_slug_unique` (`slug`),
  KEY `categories_parent_id_index` (`parent_id`),
  CONSTRAINT `categories_parent_id_foreign` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,'mobile-gadgets-computers','Mobile, Gadgets & Computers',NULL,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:51:59'),(2,'smartphones','Smartphones',1,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(3,'laptops','Laptops',1,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(4,'earphones-audio','Earphones & Audio',1,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(5,'chargers-powerbanks','Chargers & Powerbanks',1,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(6,'phone-accessories','Phone Accessories',1,5,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(7,'home-appliances','Home Appliances',NULL,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(8,'refrigerators','Refrigerators',7,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(9,'electric-fans','Electric Fans',7,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(10,'air-conditioners','Air Conditioners',7,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(11,'washing-machines','Washing Machines',7,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(12,'rice-cookers-kitchen','Rice Cookers & Kitchen Appliances',7,5,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(13,'home-living','Home & Living',NULL,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(14,'furniture','Furniture',13,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(15,'home-decor','Home Decor',13,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(16,'bedding-linens','Bedding & Linens',13,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(17,'kitchenware','Kitchenware',13,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(18,'storage-organization','Storage & Organization',13,5,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(19,'home-improvement-tools','Home Improvement & Tools',NULL,5,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(20,'hand-tools','Hand Tools',19,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(21,'power-tools','Power Tools',19,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(22,'hardware','Hardware',19,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(23,'lighting','Lighting',19,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(24,'plumbing-supplies','Plumbing Supplies',19,5,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(25,'automotive-motorcycle','Automotive & Motorcycle',NULL,11,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(26,'car-accessories','Car Accessories',25,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(27,'motorcycle-parts','Motorcycle Parts',25,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(28,'helmets','Helmets',25,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(29,'car-care','Car Care',25,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(30,'womens-fashion','Women\'s Fashion',NULL,6,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(31,'womens-tops','Tops',30,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(32,'dresses','Dresses',30,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(33,'womens-bottoms','Bottoms',30,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(34,'womens-outerwear','Outerwear',30,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(35,'womens-footwear','Footwear',30,5,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(36,'mens-fashion','Men\'s Fashion',NULL,7,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(37,'shirts','Shirts',36,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(38,'pants','Pants',36,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(39,'mens-outerwear','Outerwear',36,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(40,'mens-footwear','Footwear',36,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(41,'bags-accessories','Bags & Accessories',NULL,8,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(42,'bags-wallets','Bags & Wallets',41,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(43,'jewelry','Jewelry',41,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(44,'watches','Watches',41,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(45,'sunglasses','Sunglasses',41,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(46,'health-beauty','Health & Beauty',NULL,9,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(47,'skincare','Skincare',46,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(48,'makeup','Makeup',46,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(49,'personal-care','Personal Care',46,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(50,'supplements','Supplements',46,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(51,'sports-outdoors','Sports & Outdoors',NULL,10,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(52,'fitness-equipment','Fitness Equipment',51,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(53,'outdoor-gear','Outdoor Gear',51,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(54,'sportswear','Sportswear',51,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(55,'bicycles','Bicycles',51,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(56,'food-grocery','Food & Grocery',NULL,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(57,'snacks','Snacks',56,1,1,1,8.00,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(58,'beverages','Beverages',56,2,1,1,8.00,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(59,'fresh-produce','Fresh Produce',56,3,1,1,8.00,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(60,'instant-meals','Instant Meals',56,4,1,1,8.00,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(61,'pantry-staples','Pantry Staples',56,5,1,1,8.00,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(62,'baby-kids','Baby & Kids',NULL,12,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(63,'baby-gear','Baby Gear',62,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(64,'kids-clothing','Kids\' Clothing',62,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(65,'feeding-nursing','Feeding & Nursing',62,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(66,'diapers','Diapers',62,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(67,'toys-hobbies-books','Toys, Hobbies & Books',NULL,13,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(68,'toys','Toys',67,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(69,'collectibles-hobbies','Collectibles & Hobbies',67,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(70,'books','Books',67,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(71,'stationery','Stationery',67,4,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(72,'pet-supplies','Pet Supplies',NULL,14,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(73,'pet-food','Pet Food',72,1,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(74,'pet-accessories','Pet Accessories',72,2,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00'),(75,'pet-health-grooming','Pet Health & Grooming',72,3,1,0,NULL,'2026-08-27 00:40:59','2026-09-01 16:52:00');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversations`
--

DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `buyer_id` bigint unsigned DEFAULT NULL,
  `seller_id` bigint unsigned DEFAULT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'buyer_seller',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_id` bigint unsigned DEFAULT NULL,
  `order_id` bigint unsigned DEFAULT NULL,
  `last_message_at` timestamp NULL DEFAULT NULL,
  `buyer_unread` int unsigned NOT NULL DEFAULT '0',
  `admin_unread` int unsigned NOT NULL DEFAULT '0',
  `seller_unread` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `conversations_last_message_at_index` (`last_message_at`),
  KEY `conversations_seller_id_foreign` (`seller_id`),
  KEY `conversations_buyer_id_foreign` (`buyer_id`),
  KEY `conversations_product_id_foreign` (`product_id`),
  KEY `conversations_order_id_foreign` (`order_id`),
  KEY `conversations_type_index` (`type`),
  KEY `conversations_status_index` (`status`),
  CONSTRAINT `conversations_buyer_id_foreign` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversations_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `conversations_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL,
  CONSTRAINT `conversations_seller_id_foreign` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
INSERT INTO `conversations` VALUES (1,2,NULL,'buyer_admin','open','Customer Support Inquiry',NULL,NULL,'2026-09-01 13:47:25',0,0,0,'2026-09-01 11:14:14','2026-09-01 14:06:35'),(2,NULL,2,'seller_admin','open','Platform Support',NULL,NULL,'2026-09-01 16:57:50',0,0,1,'2026-09-01 15:18:31','2026-09-01 17:25:47');
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
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
INSERT INTO `jobs` VALUES (1,'default','{\"uuid\":\"1795b13a-335c-4c8e-af0d-ad4125087056\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:3;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:25:\\\"fakerdelvalle22@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1786575377,\"delay\":null}',0,NULL,1786575377,1786575377),(2,'default','{\"uuid\":\"b8fac4ac-78c6-4e82-8b5a-dcbb46ffb415\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:4;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:26:\\\"legenddelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1786609209,\"delay\":null}',0,NULL,1786609209,1786609209),(3,'default','{\"uuid\":\"7b7d2575-1071-4791-a01a-2cac25d03188\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:5;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:25:\\\"carlanderson22k@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787023688,\"delay\":null}',0,NULL,1787023688,1787023688),(4,'default','{\"uuid\":\"e6d8901a-40af-46c1-a7a5-8e052ad03587\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:6;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"sammueldelvalle22@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787023710,\"delay\":null}',0,NULL,1787023710,1787023710),(5,'default','{\"uuid\":\"0c7c570c-4725-4379-8e49-a1f30a9fee47\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:7;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:28:\\\"arpiedelvalle.1978@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787024960,\"delay\":null}',0,NULL,1787024960,1787024960),(6,'default','{\"uuid\":\"f2a3a6ab-6968-4124-acd4-35bd616f7f30\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:8;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:24:\\\"romulojules123@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787128534,\"delay\":null}',0,NULL,1787128534,1787128534),(7,'default','{\"uuid\":\"2ed610f4-05e8-4184-9d48-4d8ba2dc3511\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:9;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:25:\\\"andrewespino478@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787129723,\"delay\":null}',0,NULL,1787129723,1787129723),(8,'default','{\"uuid\":\"4b2c6bb7-d3ce-476d-9274-2de5bcd865ca\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:10;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:22:\\\"bboi.1234.15@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787129985,\"delay\":null}',0,NULL,1787129985,1787129985),(9,'default','{\"uuid\":\"bef59ce7-8cbb-4c4f-b478-2229647cc4ed\",\"displayName\":\"App\\\\Mail\\\\BuyerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:29:\\\"App\\\\Mail\\\\BuyerApplicationMail\\\":5:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:8:\\\"decision\\\";s:8:\\\"approved\\\";s:6:\\\"reason\\\";N;s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787203489,\"delay\":null}',0,NULL,1787203489,1787203489),(10,'default','{\"uuid\":\"c19f8daf-83bc-48fc-82c7-1b7f45acd5d2\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:11;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:24:\\\"mirandachito62@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787388546,\"delay\":null}',0,NULL,1787388546,1787388546),(11,'default','{\"uuid\":\"e8a815a2-313b-40b2-8c69-cfdae487fe5e\",\"displayName\":\"App\\\\Mail\\\\WelcomeMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:20:\\\"App\\\\Mail\\\\WelcomeMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:12;s:9:\\\"relations\\\";a:0:{}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:28:\\\"lennon.delvalle.15@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787485033,\"delay\":null}',0,NULL,1787485033,1787485033),(12,'default','{\"uuid\":\"7866ff1d-fc05-4a4f-8476-3c92b7c67eb6\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787498405,\"delay\":null}',0,NULL,1787498405,1787498405),(13,'default','{\"uuid\":\"bb163a49-c029-4642-8cd2-be50213a0dbf\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787500030,\"delay\":null}',0,NULL,1787500030,1787500030),(14,'default','{\"uuid\":\"993f75dc-4a76-4f13-ab43-2676885aba07\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787500099,\"delay\":null}',0,NULL,1787500099,1787500099),(15,'default','{\"uuid\":\"378e35d8-a942-4798-9b8e-e0f63a282183\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787500433,\"delay\":null}',0,NULL,1787500433,1787500433),(16,'default','{\"uuid\":\"18082cfd-8b38-48cd-a06e-f1ff59e3c715\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787500516,\"delay\":null}',0,NULL,1787500516,1787500516),(17,'default','{\"uuid\":\"64854c19-4c78-4953-9125-826bb6031664\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787500638,\"delay\":null}',0,NULL,1787500638,1787500638),(18,'default','{\"uuid\":\"1890bb56-a9c4-42b2-b8fe-9ea75ad85f9d\",\"displayName\":\"App\\\\Mail\\\\SellerApplicationMail\",\"job\":\"Illuminate\\\\Queue\\\\CallQueuedHandler@call\",\"maxTries\":null,\"maxExceptions\":null,\"failOnTimeout\":false,\"backoff\":null,\"timeout\":null,\"retryUntil\":null,\"deleteWhenMissingModels\":false,\"data\":{\"commandName\":\"Illuminate\\\\Mail\\\\SendQueuedMailable\",\"command\":\"O:34:\\\"Illuminate\\\\Mail\\\\SendQueuedMailable\\\":19:{s:8:\\\"mailable\\\";O:30:\\\"App\\\\Mail\\\\SellerApplicationMail\\\":3:{s:4:\\\"user\\\";O:45:\\\"Illuminate\\\\Contracts\\\\Database\\\\ModelIdentifier\\\":5:{s:5:\\\"class\\\";s:15:\\\"App\\\\Models\\\\User\\\";s:2:\\\"id\\\";i:2;s:9:\\\"relations\\\";a:1:{i:0;s:13:\\\"sellerProfile\\\";}s:10:\\\"connection\\\";s:5:\\\"mysql\\\";s:15:\\\"collectionClass\\\";N;}s:2:\\\"to\\\";a:1:{i:0;a:2:{s:4:\\\"name\\\";N;s:7:\\\"address\\\";s:27:\\\"jaymarkdelvalle42@gmail.com\\\";}}s:6:\\\"mailer\\\";s:4:\\\"smtp\\\";}s:5:\\\"tries\\\";N;s:7:\\\"timeout\\\";N;s:13:\\\"maxExceptions\\\";N;s:17:\\\"shouldBeEncrypted\\\";b:0;s:3:\\\"job\\\";N;s:10:\\\"connection\\\";N;s:5:\\\"queue\\\";N;s:12:\\\"messageGroup\\\";N;s:12:\\\"deduplicator\\\";N;s:13:\\\"debounceOwner\\\";s:0:\\\"\\\";s:15:\\\"uniqueLockOwner\\\";s:0:\\\"\\\";s:5:\\\"delay\\\";N;s:11:\\\"afterCommit\\\";N;s:10:\\\"middleware\\\";a:0:{}s:7:\\\"chained\\\";a:0:{}s:15:\\\"chainConnection\\\";N;s:10:\\\"chainQueue\\\";N;s:19:\\\"chainCatchCallbacks\\\";N;}\",\"batchId\":null},\"createdAt\":1787500928,\"delay\":null}',0,NULL,1787500928,1787500928);
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
  `attachment_type` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_data` json DEFAULT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `messages_sender_id_foreign` (`sender_id`),
  KEY `messages_conversation_id_created_at_index` (`conversation_id`,`created_at`),
  CONSTRAINT `messages_conversation_id_foreign` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_sender_id_foreign` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (1,1,2,'When will this order be shipped?',NULL,NULL,'2026-09-01 11:15:58','2026-09-01 11:14:20','2026-09-01 11:15:58'),(2,1,2,'kinginamopo',NULL,NULL,'2026-09-01 11:15:58','2026-09-01 11:14:32','2026-09-01 11:15:58'),(3,1,1,'uhlul order this shipped amputa, wala pa ngang nabibili, baliw yarn?!',NULL,NULL,'2026-09-01 11:24:02','2026-09-01 11:17:20','2026-09-01 11:24:02'),(4,1,2,'tanginamo pla e testing lng to',NULL,NULL,'2026-09-01 11:29:02','2026-09-01 11:24:45','2026-09-01 11:29:02'),(5,1,2,'wait hindi ba seller din ako? bat buyer nakalagay sa admin TANGINA ANOTHER DEBUG',NULL,NULL,'2026-09-01 11:29:02','2026-09-01 11:27:41','2026-09-01 11:29:02'),(6,1,2,'Hello',NULL,NULL,'2026-09-01 12:33:08','2026-09-01 12:32:30','2026-09-01 12:33:08'),(7,1,2,'HELLOOO',NULL,NULL,'2026-09-01 12:33:08','2026-09-01 12:32:37','2026-09-01 12:33:08'),(8,1,2,'WOI',NULL,NULL,'2026-09-01 12:33:08','2026-09-01 12:32:38','2026-09-01 12:33:08'),(9,1,1,'ano',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:46:00','2026-09-01 13:09:32'),(10,1,1,'ano',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:46:14','2026-09-01 13:09:32'),(11,1,1,'Hello',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:46:27','2026-09-01 13:09:32'),(12,1,2,'Test message from verification test',NULL,NULL,'2026-09-01 12:53:20','2026-09-01 12:51:27','2026-09-01 12:53:20'),(13,1,1,'WOI',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:54:21','2026-09-01 13:09:32'),(14,1,1,'helo',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:58:54','2026-09-01 13:09:32'),(15,1,1,'GAGU KA BA?!',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:59:04','2026-09-01 13:09:32'),(16,1,1,'HELLO!',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 12:59:37','2026-09-01 13:09:32'),(17,1,1,'.',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 13:06:17','2026-09-01 13:09:32'),(18,1,1,'.',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 13:06:23','2026-09-01 13:09:32'),(19,1,1,'.',NULL,NULL,'2026-09-01 13:09:32','2026-09-01 13:06:24','2026-09-01 13:09:32'),(20,1,2,'pweh',NULL,NULL,'2026-09-01 13:10:03','2026-09-01 13:09:36','2026-09-01 13:10:03'),(21,1,2,'pweh',NULL,NULL,'2026-09-01 13:10:25','2026-09-01 13:10:13','2026-09-01 13:10:25'),(22,1,2,'Test message from verification test',NULL,NULL,'2026-09-01 13:14:50','2026-09-01 13:13:20','2026-09-01 13:14:50'),(23,1,2,'pweh',NULL,NULL,'2026-09-01 13:18:28','2026-09-01 13:15:13','2026-09-01 13:18:28'),(24,1,2,'YOWN',NULL,NULL,'2026-09-01 13:18:28','2026-09-01 13:15:18','2026-09-01 13:18:28'),(25,1,2,'SA WAKAS PUTA REAL TIME DEN',NULL,NULL,'2026-09-01 13:18:28','2026-09-01 13:15:24','2026-09-01 13:18:28'),(26,1,2,'helo',NULL,NULL,'2026-09-01 13:23:55','2026-09-01 13:22:59','2026-09-01 13:23:55'),(27,1,1,'?TANGINA HAWHAHAHAHAAH',NULL,NULL,'2026-09-01 13:47:20','2026-09-01 13:47:01','2026-09-01 13:47:20'),(28,1,2,'gago ba HAAHAWAHA',NULL,NULL,'2026-09-01 13:58:01','2026-09-01 13:47:25','2026-09-01 13:58:01'),(29,2,1,'isa kang nigga',NULL,NULL,'2026-09-01 16:57:41','2026-09-01 15:18:46','2026-09-01 16:57:41'),(30,2,2,'uhlol',NULL,NULL,'2026-09-01 17:25:47','2026-09-01 16:57:50','2026-09-01 17:25:47');
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
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_08_12_164340_create_personal_access_tokens_table',1),(5,'2026_08_12_164525_create_seller_profiles_table',1),(6,'2026_08_12_193559_make_phone_nullable_on_users_table',2),(7,'2026_08_12_193600_create_sessions_table',3),(8,'2026_08_12_210056_add_profile_fields_to_users_table',4),(9,'2026_08_12_210343_create_addresses_table',5),(10,'2026_08_12_215517_add_avatar_to_users_table',6),(11,'2026_08_12_224456_create_admin_activity_logs_table',7),(12,'2026_08_13_000001_add_shop_fields_to_seller_profiles_table',8),(13,'2026_08_13_100000_create_orders_payments_disputes_reviews_tables',9),(14,'2026_08_14_000001_create_conversations_messages_tables',10),(15,'2026_08_18_031238_add_buyer_fields_to_users_table',11),(16,'2026_08_18_055831_alter_sex_enum_on_users_table',12),(17,'2026_08_18_055925_drop_gender_column_from_users_table',13),(18,'2026_08_19_000001_add_business_permit_to_seller_profiles_table',14),(19,'2026_08_19_100000_add_government_id_back_to_users_table',14),(20,'2026_08_20_000001_add_address_to_seller_profiles_table',15),(21,'2026_08_20_000002_add_school_id_to_government_id_type_enum',16),(22,'2026_08_20_000003_add_school_id_to_seller_profiles_government_id_type_enum',16),(23,'2026_08_21_000001_add_compliance_docs_to_seller_profiles_table',17),(24,'2026_08_24_000001_add_selfie_with_id_to_seller_profiles_table',18),(25,'2026_08_25_000001_create_products_catalog_tables',19),(26,'2026_08_26_000001_add_logo_banner_to_seller_profiles_table',20),(27,'2026_08_27_115421_add_shop_contact_number_to_seller_profiles_table',21),(28,'2026_08_27_122136_add_policy_fields_to_seller_profiles_table',22),(29,'2026_08_27_140755_add_shop_bio_to_seller_profiles_table',23),(30,'2026_08_27_164229_add_archive_reason_to_products_table',24),(31,'2026_08_28_000001_add_archived_by_to_products_table',25),(32,'2026_08_29_000001_add_catalog_fields_to_products_table',26),(33,'2026_08_30_000001_create_wishlists_and_store_follows_tables',27),(34,'2026_09_02_000001_add_payment_verification_and_payouts_tables',28),(35,'2026_09_01_190320_upgrade_conversations_and_messages_table',29),(36,'2026_09_02_100000_add_fields_to_categories_table',30);
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
  `category_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `quantity` int unsigned NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  `commission_rate` decimal(5,4) NOT NULL DEFAULT '0.1000',
  `commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `seller_earnings` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payout_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_release',
  `delivered_at` timestamp NULL DEFAULT NULL,
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
  `shipping_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shipping_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shipping_address` text COLLATE utf8mb4_unicode_ci,
  `shipping_province` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shipping_city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shipping_barangay` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `payment_method` enum('gcash','cod') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_proof_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_verified_at` timestamp NULL DEFAULT NULL,
  `payment_status` enum('pending','paid','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `status` enum('pending','confirmed','packed','shipped','out_for_delivery','delivered','cancelled','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `payment_verified_by` bigint unsigned DEFAULT NULL,
  `verification_rejection_reason` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_order_number_unique` (`order_number`),
  KEY `orders_buyer_id_index` (`buyer_id`),
  KEY `orders_status_index` (`status`),
  KEY `orders_created_at_index` (`created_at`),
  KEY `orders_payment_verified_by_foreign` (`payment_verified_by`),
  CONSTRAINT `orders_buyer_id_foreign` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `orders_payment_verified_by_foreign` FOREIGN KEY (`payment_verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
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
-- Table structure for table `payout_requests`
--

DROP TABLE IF EXISTS `payout_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payout_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `seller_id` bigint unsigned NOT NULL,
  `reference_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `gcash_number` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gcash_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','processing','completed','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `processed_by` bigint unsigned DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `admin_notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payout_requests_reference_code_unique` (`reference_code`),
  KEY `payout_requests_processed_by_foreign` (`processed_by`),
  KEY `payout_requests_seller_id_index` (`seller_id`),
  KEY `payout_requests_status_index` (`status`),
  KEY `payout_requests_created_at_index` (`created_at`),
  CONSTRAINT `payout_requests_processed_by_foreign` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payout_requests_seller_id_foreign` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payout_requests`
--

LOCK TABLES `payout_requests` WRITE;
/*!40000 ALTER TABLE `payout_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `payout_requests` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=130 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
INSERT INTO `personal_access_tokens` VALUES (4,'App\\Models\\User',3,'auth_token','14dba466a9b4bca9bc04b476efc7e8231a4ad0bca416951ee6429649f0b0f51a','[\"*\"]','2026-08-12 14:56:17',NULL,'2026-08-12 14:56:17','2026-08-12 14:56:17'),(5,'App\\Models\\User',1,'auth_token','cda4cdf93e4e87476ed92274f63ab83e87270d84b92e1007a6122bde9b43ee00','[\"*\"]','2026-08-12 15:05:59',NULL,'2026-08-12 14:58:08','2026-08-12 15:05:59'),(7,'App\\Models\\User',1,'auth_token','67aeb819807d98acf89fae52ad4140b42881ed5e05e2723efca4d956afc53499','[\"*\"]','2026-08-12 23:53:27',NULL,'2026-08-12 23:45:11','2026-08-12 23:53:27'),(12,'App\\Models\\User',1,'auth_token','d2485c9939e9403072dd69201e3c94d86b01dcb639b809215a32852bd4b2d7e2','[\"*\"]','2026-08-13 05:51:37',NULL,'2026-08-13 04:59:34','2026-08-13 05:51:37'),(14,'App\\Models\\User',1,'auth_token','89a84dd566eac9d2359641d425ced33bbf165d1dc6753596b365534c5f4f8904','[\"*\"]','2026-08-13 06:29:41',NULL,'2026-08-13 06:23:07','2026-08-13 06:29:41'),(16,'App\\Models\\User',1,'auth_token','e403e7257a0c0a3fb083980ee80afe72c6e1ec7b4401acd9c034c29222003b89','[\"*\"]','2026-08-13 08:16:35',NULL,'2026-08-13 07:02:41','2026-08-13 08:16:35'),(17,'App\\Models\\User',1,'auth_token','4f067dd041683162974228cd9a9744fff7d887cbe7cdbdd6244f19b5def5f642','[\"*\"]','2026-08-13 09:06:13',NULL,'2026-08-13 08:16:46','2026-08-13 09:06:13'),(18,'App\\Models\\User',1,'auth_token','46a6ca7f5e79d334cc63016d49894e589aaef121f1b1e358b502486e01c55c64','[\"*\"]','2026-08-15 04:19:39',NULL,'2026-08-15 04:19:36','2026-08-15 04:19:39'),(20,'App\\Models\\User',1,'auth_token','2c0dffde9b83e8d59a8d0e3fd693151401d89f53bd8115bc817239621e953262','[\"*\"]','2026-08-16 13:50:30',NULL,'2026-08-15 04:58:17','2026-08-16 13:50:30'),(21,'App\\Models\\User',1,'auth_token','53475b724fb5831f724328b8b0dbea6d22794fb82aba25b1921fc2dc549df7dd','[\"*\"]','2026-08-17 18:22:00',NULL,'2026-08-16 15:00:36','2026-08-17 18:22:00'),(23,'App\\Models\\User',5,'auth_token','e9c560119ae74c3829e27bf84a1e0fc018ae40d013376d3c95d88bc8005ea878','[\"*\"]','2026-08-17 19:28:09',NULL,'2026-08-17 19:28:08','2026-08-17 19:28:09'),(24,'App\\Models\\User',6,'auth_token','c2f52793145a2fb237d1275f7cb03e0fdabd593217acf087fbe89e115ab6d394','[\"*\"]','2026-08-17 19:28:30',NULL,'2026-08-17 19:28:30','2026-08-17 19:28:30'),(25,'App\\Models\\User',6,'auth_token','b6ff7fa8222408c9a2cd6217a273ef832dc6dfca12c111f1c263faf2e1d9cf24','[\"*\"]','2026-08-17 19:49:09',NULL,'2026-08-17 19:49:09','2026-08-17 19:49:09'),(26,'App\\Models\\User',7,'auth_token','187e4dd6d06f2c6c4bd1b7a8f24a48777becd0fa39b4a87cb750b9b32ff6f7e0','[\"*\"]','2026-08-17 19:51:52',NULL,'2026-08-17 19:49:20','2026-08-17 19:51:52'),(30,'App\\Models\\User',1,'auth_token','332e772dbc4b32d7acb8d0e42eb67a744025f3d32d77a8ad87649cdc0aff0550','[\"*\"]','2026-08-18 20:29:01',NULL,'2026-08-18 18:59:33','2026-08-18 20:29:01'),(32,'App\\Models\\User',1,'auth_token','63688c9fbe6261fc8d5dcc1480702af8474918789bafcd7daa4efd49db1885f8','[\"*\"]','2026-08-18 20:43:32',NULL,'2026-08-18 20:29:29','2026-08-18 20:43:32'),(36,'App\\Models\\User',1,'auth_token','46cd1a1edb4449a6f9d647a845c8a7ecff1557ff8170a674cd5f694b28ab07bd','[\"*\"]','2026-08-18 20:54:03',NULL,'2026-08-18 20:51:17','2026-08-18 20:54:03'),(37,'App\\Models\\User',1,'auth_token','b46c2177b0561756c04e376e234c9ddaebcd2b51916153bdb2d424cd86c16048','[\"*\"]','2026-08-18 23:44:33',NULL,'2026-08-18 20:54:55','2026-08-18 23:44:33'),(41,'App\\Models\\User',6,'auth_token','0a8e59491cef725f3d6c87c66bb0fa4b8dcd0f0d838c5f509d5f2f4279b3115f','[\"*\"]','2026-08-19 00:22:52',NULL,'2026-08-19 00:14:47','2026-08-19 00:22:52'),(42,'App\\Models\\User',4,'auth_token','853a3323679051596e40df3b15ec73ad354f45329e7d050dc211a81b5ff62b83','[\"*\"]','2026-08-19 00:25:15',NULL,'2026-08-19 00:25:14','2026-08-19 00:25:15'),(43,'App\\Models\\User',6,'auth_token','c6458b4113b064c165a12448d49369b0c17883471663a5b1c17dfa65b3a806b3','[\"*\"]','2026-08-19 00:30:54',NULL,'2026-08-19 00:30:53','2026-08-19 00:30:54'),(44,'App\\Models\\User',4,'auth_token','3fe1d12c9731ce3a2e86474a453ff655945d18838d660c91426a95178c50433d','[\"*\"]','2026-08-19 00:31:04',NULL,'2026-08-19 00:31:03','2026-08-19 00:31:04'),(45,'App\\Models\\User',4,'auth_token','e1e4355a9969e18230b63eb8f36782b2e0a66099913311f793a2186cdbda43b3','[\"*\"]','2026-08-19 00:32:23',NULL,'2026-08-19 00:32:22','2026-08-19 00:32:23'),(46,'App\\Models\\User',8,'auth_token','67264a76ba7ddbebd8c7a8eb874d4c597b2b7e2c564297d021a7cbdc3add0cc8','[\"*\"]','2026-08-19 00:35:34',NULL,'2026-08-19 00:35:34','2026-08-19 00:35:34'),(47,'App\\Models\\User',8,'auth_token','7e45b38945b03619433174f55d28ba5905d5e4676c3e6c49b9ad68ea20b28094','[\"*\"]','2026-08-19 00:48:35',NULL,'2026-08-19 00:48:33','2026-08-19 00:48:35'),(48,'App\\Models\\User',5,'auth_token','655bf03a25d6d889c66759e793a4133710aa3119927ee9bc0e198dd868aa7cca','[\"*\"]',NULL,NULL,'2026-08-19 00:48:54','2026-08-19 00:48:54'),(49,'App\\Models\\User',5,'auth_token','eea000ddc5693323ed1ac936f5088e3396574464a06d9cce261d6aa7614f2002','[\"*\"]',NULL,NULL,'2026-08-19 00:49:03','2026-08-19 00:49:03'),(50,'App\\Models\\User',5,'auth_token','c809aea115f6c361a2a7155324daed2755e4fb9dff73e464ace8355ea7160bb2','[\"*\"]',NULL,NULL,'2026-08-19 00:49:12','2026-08-19 00:49:12'),(51,'App\\Models\\User',5,'auth_token','ab61a5a04f352c9a63c481407431ad8302a4e8aa1b1a55f5ab73205383fc9b4e','[\"*\"]',NULL,NULL,'2026-08-19 00:50:50','2026-08-19 00:50:50'),(54,'App\\Models\\User',5,'auth_token','ea48f2ac84b3957b13acb606ecdb8d740ab4ae54f3b7a9cc962c16b125a46d16','[\"*\"]',NULL,NULL,'2026-08-19 00:52:44','2026-08-19 00:52:44'),(55,'App\\Models\\User',8,'auth_token','8c53c601d0966473f6b89d3c4bacf2dd43bc2d26fce95469f6aecd6ae9102320','[\"*\"]',NULL,NULL,'2026-08-19 00:52:58','2026-08-19 00:52:58'),(58,'App\\Models\\User',9,'auth_token','1a5b92b6a04041ecbb500a9b63e12dd5df46cfc0505ae0d946d600994a920a64','[\"*\"]','2026-08-19 21:22:35',NULL,'2026-08-19 00:55:23','2026-08-19 21:22:35'),(59,'App\\Models\\User',10,'auth_token','8e990b95a257f14603ad8e57e4c7c9e148b035752ff1b6583fa973d1830c0acf','[\"*\"]','2026-08-19 00:59:51',NULL,'2026-08-19 00:59:45','2026-08-19 00:59:51'),(60,'App\\Models\\User',10,'auth_token','7d2b1a32244345f162811249d377300800e76fa40309b42cf63a3a2694279c32','[\"*\"]','2026-08-19 01:01:20',NULL,'2026-08-19 01:01:20','2026-08-19 01:01:20'),(61,'App\\Models\\User',10,'auth_token','78c125b49859bafb9d37114a088a59f8f6c4caeab2262edb27476c5af73b934a','[\"*\"]','2026-08-19 01:01:28',NULL,'2026-08-19 01:01:27','2026-08-19 01:01:28'),(63,'App\\Models\\User',1,'auth_token','bd85207a30ae1f597af070782563416ef7e622b180895fa73a8fc3b619daf03c','[\"*\"]','2026-08-19 03:15:32',NULL,'2026-08-19 01:05:42','2026-08-19 03:15:32'),(65,'App\\Models\\User',1,'auth_token','9361152528a629b272d38c98e35232b98c5dc2911131862955914787b0ab0741','[\"*\"]','2026-08-19 03:28:30',NULL,'2026-08-19 03:25:01','2026-08-19 03:28:30'),(67,'App\\Models\\User',1,'auth_token','27b3645ec1ca0887ce5ec37fddb90c2f756369e16508eb4f9bd4aa2f7f1acfc7','[\"*\"]','2026-08-19 03:30:07',NULL,'2026-08-19 03:29:29','2026-08-19 03:30:07'),(68,'App\\Models\\User',6,'auth_token','4a0129e7c492774d6bfeb071a23cdfa7f8e6c291f77f4658f0860d2835fd87ab','[\"*\"]','2026-08-19 03:30:33',NULL,'2026-08-19 03:30:33','2026-08-19 03:30:33'),(69,'App\\Models\\User',7,'auth_token','a05a98a25a168c261ad2972dd1c7ea7452966bac411d024b2e8103f612add561','[\"*\"]','2026-08-19 03:39:15',NULL,'2026-08-19 03:30:44','2026-08-19 03:39:15'),(70,'App\\Models\\User',7,'auth_token','a672e1dcb0cd4ba08bb9e5f55daeefcb27d5e58eeb28dbc0eb680d69d7becbf8','[\"*\"]','2026-08-19 03:40:49',NULL,'2026-08-19 03:39:37','2026-08-19 03:40:49'),(71,'App\\Models\\User',1,'auth_token','eb1d7834a02099a273c3afc15138b20a7a8334cdca72384c11a8d6950f88fbca','[\"*\"]','2026-08-19 03:59:10',NULL,'2026-08-19 03:41:34','2026-08-19 03:59:10'),(72,'App\\Models\\User',1,'auth_token','0d7bec167796fc3d5f2c3986029ace193651986dd3e953732c8f15671d2e0bb7','[\"*\"]','2026-08-19 05:03:15',NULL,'2026-08-19 04:01:20','2026-08-19 05:03:15'),(73,'App\\Models\\User',3,'auth_token','292a2477dca6b9ed8fcee8e8648acf53f0c2f47350efbd7a4cef8f8ab3381913','[\"*\"]','2026-08-19 05:03:30',NULL,'2026-08-19 05:03:29','2026-08-19 05:03:30'),(74,'App\\Models\\User',1,'auth_token','829993fded49faf2ad400e6e80b5df11b55817dd3afe2b1154479a34808c8949','[\"*\"]','2026-08-19 21:17:57',NULL,'2026-08-19 05:20:47','2026-08-19 21:17:57'),(76,'App\\Models\\User',1,'auth_token','b6aa657face36e112f20297342ec667f8c19ae47ea7ac75e49ed27e9953cf59d','[\"*\"]','2026-08-24 20:48:36',NULL,'2026-08-19 21:22:48','2026-08-24 20:48:36'),(77,'App\\Models\\User',2,'auth_token','a10f3889921533530873e11e7224a5a5f4ff9ee563978a84b4dcc7c8344eb3df','[\"*\"]','2026-08-19 22:20:18',NULL,'2026-08-19 21:29:27','2026-08-19 22:20:18'),(78,'App\\Models\\User',3,'auth_token','baf95a6872d64f88c76771f6441508a5ef1fe55747dcf404fc21c18229a81582','[\"*\"]','2026-08-22 00:36:48',NULL,'2026-08-19 22:48:24','2026-08-22 00:36:48'),(79,'App\\Models\\User',11,'auth_token','76ff33e212cbadc2ae37547388fcf99b649e61cfc307d3fcdc1ababf9a44092c','[\"*\"]','2026-08-22 00:50:03',NULL,'2026-08-22 00:49:06','2026-08-22 00:50:03'),(80,'App\\Models\\User',1,'auth_token','4fe85384af583fa23b7ce0f1e0e6174373329c7f11d09726fb225943e492f958','[\"*\"]','2026-08-22 00:58:28',NULL,'2026-08-22 00:58:11','2026-08-22 00:58:28'),(81,'App\\Models\\User',1,'auth_token','722bd688ad10dba69bf55ba611a786a22cda7f75ccb23cfe8e282d266ff86eb7','[\"*\"]','2026-08-23 04:42:21',NULL,'2026-08-23 03:32:58','2026-08-23 04:42:21'),(82,'App\\Models\\User',2,'auth_token','a6a1cdb7eacb1d0f4ccbd11d2b035d10a2bc5a2ab33a233c715b8105bc87dcec','[\"*\"]','2026-08-23 04:43:55',NULL,'2026-08-23 04:43:05','2026-08-23 04:43:55'),(83,'App\\Models\\User',1,'auth_token','1e6ef8ec617cfacfd3ef2199e84812b5526399b6099d4916281b76ad5849a8ee','[\"*\"]','2026-08-23 07:03:02',NULL,'2026-08-23 06:46:13','2026-08-23 07:03:02'),(84,'App\\Models\\User',2,'auth_token','92f2e4e7706a819f89d4cb8dce900c71d69662368980230fb2b22f1820e638cb','[\"*\"]','2026-08-24 01:40:52',NULL,'2026-08-23 07:03:08','2026-08-24 01:40:52'),(85,'App\\Models\\User',2,'auth_token','0c02e6db00bb607bb55d02b9013c7dcf55b09c93cd65224e4663d0e35bb97781','[\"*\"]','2026-08-24 02:08:24',NULL,'2026-08-24 01:45:21','2026-08-24 02:08:24'),(86,'App\\Models\\User',1,'auth_token','d1228a32830c4eee72039c4c3f7a7b4564ce531a3933b792db5bee8696d81cfa','[\"*\"]','2026-08-24 02:08:41',NULL,'2026-08-24 02:08:36','2026-08-24 02:08:41'),(87,'App\\Models\\User',2,'auth_token','05a5f02cc28b9ada7bc40e15fedf9bb5efb77817754f73c82c060e565c9bfd5d','[\"*\"]','2026-08-24 02:23:24',NULL,'2026-08-24 02:23:24','2026-08-24 02:23:24'),(88,'App\\Models\\User',1,'auth_token','5914a5ff5c1e8b0bb4b4286b7250faa5c21cd239f1c0584744a036748622fdf5','[\"*\"]','2026-08-24 03:33:14',NULL,'2026-08-24 03:33:06','2026-08-24 03:33:14'),(89,'App\\Models\\User',2,'auth_token','aedfd84c48443e9da64fce767068f76d970c12b8cdc6172051aaddc5dbba9071','[\"*\"]','2026-08-26 04:19:56',NULL,'2026-08-24 03:45:37','2026-08-26 04:19:56'),(90,'App\\Models\\User',1,'auth_token','2984f327f2434db14fbd598c308e4e2b7be56b04f55a4be738c41a200148c08a','[\"*\"]','2026-09-01 13:09:09',NULL,'2026-08-24 20:49:24','2026-09-01 13:09:09'),(91,'App\\Models\\User',2,'auth_token','fbc74915ce8e6307a235c22c8f11794db65b28e2355f0799f748ff98fec08c4a','[\"*\"]','2026-08-26 04:27:19',NULL,'2026-08-26 04:22:29','2026-08-26 04:27:19'),(92,'App\\Models\\User',2,'auth_token','5125fc47f9858366d96a9212d121f94c451cde3e0d4ca1f2dc1f688c35b7e4cb','[\"*\"]','2026-08-26 05:19:56',NULL,'2026-08-26 04:36:08','2026-08-26 05:19:56'),(93,'App\\Models\\User',1,'auth_token','2e5e796dd232ccb7917b19111b28f53f6e249e664f16c6bfee8d7805d5ef730e','[\"*\"]','2026-08-26 06:25:56',NULL,'2026-08-26 05:20:10','2026-08-26 06:25:56'),(94,'App\\Models\\User',2,'auth_token','6f99932a3ee3e822966010f8183ca797ebada48cd0075185b99c2ebf862d97c8','[\"*\"]','2026-08-26 22:40:55',NULL,'2026-08-26 06:27:43','2026-08-26 22:40:55'),(95,'App\\Models\\User',1,'auth_token','356fdaf18d0182d46e0aa21e041ce4cd1f0beeeceb32712535d1c48a5de9ca1d','[\"*\"]','2026-08-26 22:43:46',NULL,'2026-08-26 22:41:39','2026-08-26 22:43:46'),(96,'App\\Models\\User',2,'auth_token','1e934e7637604dcee7c44f7ab78625cb5ea09978ba42267220cab96a3f6c6458','[\"*\"]','2026-08-27 01:21:24',NULL,'2026-08-26 22:43:59','2026-08-27 01:21:24'),(97,'App\\Models\\User',1,'auth_token','1e4efc97b549e9e09de86866a093071f26a444be4e0d0cab7e283724aa84fa74','[\"*\"]','2026-08-27 01:22:21',NULL,'2026-08-27 01:22:16','2026-08-27 01:22:21'),(98,'App\\Models\\User',2,'auth_token','54e477196443805130923801065e2af9b5b78f8333b296d7c2b530576db3b40f','[\"*\"]','2026-08-27 08:30:35',NULL,'2026-08-27 01:26:39','2026-08-27 08:30:35'),(99,'App\\Models\\User',1,'auth_token','b590408f69c99f7b839e85f703249bba62ee26aa0b90f744513b229929e2ce90','[\"*\"]','2026-08-30 04:45:43',NULL,'2026-08-27 08:31:09','2026-08-30 04:45:43'),(100,'App\\Models\\User',2,'auth_token','57c63a5cfda88496ba3a31717095be5e46aa044f744de7faf9c10a2d7ffa238e','[\"*\"]','2026-08-30 04:47:28',NULL,'2026-08-30 04:47:13','2026-08-30 04:47:28'),(101,'App\\Models\\User',1,'auth_token','1c314261a4f1fc645d8adf918bc1ba3e288145238e37b8556709483c1f05e709','[\"*\"]','2026-08-30 04:49:30',NULL,'2026-08-30 04:48:03','2026-08-30 04:49:30'),(102,'App\\Models\\User',2,'auth_token','14283b6f574619f7b6ea4ca43f3a82e7111d55f9e99c4d04c47c2f9de1190bc6','[\"*\"]','2026-08-30 05:41:32',NULL,'2026-08-30 04:49:38','2026-08-30 05:41:32'),(103,'App\\Models\\User',1,'auth_token','6b545785ab33c4e35be690c1453e3d1318e8d8fe23e1b8de0fba382f70ee1e27','[\"*\"]','2026-08-30 05:42:26',NULL,'2026-08-30 05:42:20','2026-08-30 05:42:26'),(104,'App\\Models\\User',2,'auth_token','44ffeeaf56b5cae5c4d38338a38106fd45c382fba2688db70326a7f67be31e8e','[\"*\"]','2026-08-30 05:51:47',NULL,'2026-08-30 05:42:34','2026-08-30 05:51:47'),(105,'App\\Models\\User',1,'auth_token','d2a71928091137be0f5c46c05ca9af66fec72a3ef214e7be403d95ff01e0d454','[\"*\"]','2026-08-30 06:07:03',NULL,'2026-08-30 05:51:55','2026-08-30 06:07:03'),(106,'App\\Models\\User',2,'auth_token','15dffc53bc1dd67b3e33552d9a8ef77ace150c64a4ca0f69c4ad63e81318364a','[\"*\"]','2026-08-30 06:08:04',NULL,'2026-08-30 06:07:10','2026-08-30 06:08:04'),(107,'App\\Models\\User',1,'auth_token','47de4851dc854ed5da452befceef3316611473b1c1880d6a4f8a812cc0d2f98a','[\"*\"]','2026-08-30 06:08:55',NULL,'2026-08-30 06:08:16','2026-08-30 06:08:55'),(108,'App\\Models\\User',2,'auth_token','73649cb2733b164a36404b39e81dc5b04043f853589d7d82728c469be6f19a9f','[\"*\"]','2026-08-30 06:09:40',NULL,'2026-08-30 06:09:04','2026-08-30 06:09:40'),(109,'App\\Models\\User',1,'auth_token','63bd3e5aa80df6056b87b206577da107a30589fdbe455a50e2f5f1a98fba1948','[\"*\"]','2026-08-31 02:27:11',NULL,'2026-08-30 06:35:22','2026-08-31 02:27:11'),(110,'App\\Models\\User',2,'auth_token','b069b703c87245236a870db3966d980eff45070f856f82c0ae5cea12805a77f3','[\"*\"]','2026-08-31 02:29:30',NULL,'2026-08-31 02:29:03','2026-08-31 02:29:30'),(111,'App\\Models\\User',2,'auth_token','45a445d1f70c6cb88d7ff06d9a966de87502ab3278e276cb9aff6b73193acc4d','[\"*\"]','2026-08-31 05:33:06',NULL,'2026-08-31 02:32:19','2026-08-31 05:33:06'),(112,'App\\Models\\User',2,'auth_token','f59915f221f99eee6a2cdfc6af70ad32a375c2dc4c06faddeb10ee42debbf077','[\"*\"]','2026-08-31 06:28:10',NULL,'2026-08-31 05:43:50','2026-08-31 06:28:10'),(113,'App\\Models\\User',2,'auth_token','b5d63b21e544827da717431e89e4106413b2d2c50430b48293bc8912a5a4c335','[\"*\"]','2026-09-01 04:15:47',NULL,'2026-08-31 06:31:36','2026-09-01 04:15:47'),(114,'App\\Models\\User',2,'auth_token','dfb5f965b00ca783eaa6fa1b89db6c5c0795c14f2ee00ca64d136f7651090d35','[\"*\"]','2026-09-01 05:47:08',NULL,'2026-09-01 04:52:13','2026-09-01 05:47:08'),(115,'App\\Models\\User',1,'auth_token','ebdab49ad0e544f6fc74a565b3e098d48370f9f569648a7cf4dec5a2a5084eca','[\"*\"]','2026-09-01 08:54:26',NULL,'2026-09-01 05:47:27','2026-09-01 08:54:26'),(116,'App\\Models\\User',2,'auth_token','bb2787c646c5ff9892766739bc12478d321b092e4795fa3d16fe10927adf82f8','[\"*\"]','2026-09-01 09:13:53',NULL,'2026-09-01 08:54:38','2026-09-01 09:13:53'),(117,'App\\Models\\User',1,'auth_token','27a1542ff3684b14578f9d86ef8ed174a5df8e675d45455e4524b00919082c24','[\"*\"]','2026-09-01 09:34:08',NULL,'2026-09-01 09:15:08','2026-09-01 09:34:08'),(118,'App\\Models\\User',2,'auth_token','2fe3ce5b49bda493af835d94b364b8f4d39eee7b0f527a495cbd8aee371c3d34','[\"*\"]','2026-09-01 10:21:29',NULL,'2026-09-01 09:34:18','2026-09-01 10:21:29'),(119,'App\\Models\\User',1,'auth_token','462fd0d139fa1a1c48338a12a485a77f34ea7aaaef19a765f8d04cdc73a67a2b','[\"*\"]','2026-09-01 10:26:19',NULL,'2026-09-01 10:23:47','2026-09-01 10:26:19'),(120,'App\\Models\\User',2,'auth_token','54c64d257101a424747e4a7f8e1f8db9a32bd74cdaf0aea213224a802d780452','[\"*\"]','2026-09-01 11:14:50',NULL,'2026-09-01 10:26:34','2026-09-01 11:14:50'),(121,'App\\Models\\User',1,'auth_token','6de3966217a54aacf868f112780a0533b3cbcbbfa497726ed14bdd9b764629c4','[\"*\"]','2026-09-01 11:23:47',NULL,'2026-09-01 11:15:04','2026-09-01 11:23:47'),(122,'App\\Models\\User',2,'auth_token','da5069507350748037810184df4f7e3ee04bd7594b52f15eb064ea9f01e07935','[\"*\"]','2026-09-01 11:27:57',NULL,'2026-09-01 11:23:54','2026-09-01 11:27:57'),(123,'App\\Models\\User',1,'auth_token','610327ef3da5dad19bfe9ac6a6e56ced53af9e703a861de69d34a102fb07df81','[\"*\"]','2026-09-01 11:51:37',NULL,'2026-09-01 11:28:04','2026-09-01 11:51:37'),(124,'App\\Models\\User',2,'auth_token','85409189896e32d7f22497047b1e20ccb880e8a148f7cc5fe3677346373a547c','[\"*\"]','2026-09-01 12:32:55',NULL,'2026-09-01 11:51:41','2026-09-01 12:32:55'),(125,'App\\Models\\User',1,'auth_token','7837e652b0bac87f30dfeccf3b09e1f017c600a79a3c496fcfdb4ddb519b68c7','[\"*\"]','2026-09-01 13:22:21',NULL,'2026-09-01 12:33:01','2026-09-01 13:22:21'),(126,'App\\Models\\User',2,'auth_token','48d241a5315a50ec7c14b7245ad2f05f8d2bbce4dfb4ac91bc9a86e9431c34f8','[\"*\"]','2026-09-01 17:24:36',NULL,'2026-09-01 13:09:22','2026-09-01 17:24:36'),(127,'App\\Models\\User',1,'auth_token','d31044f73ad45cd1a5eacb79380aa7fc7a4fbc3252baaf2e3188c278428faaef','[\"*\"]','2026-09-01 17:27:48',NULL,'2026-09-01 13:23:49','2026-09-01 17:27:48'),(128,'App\\Models\\User',2,'auth_token','0f9c66b77c693f24f6b0b9f9854ea099f673bb678f0af47da69a203f02b95ef2','[\"*\"]','2026-09-02 03:28:45',NULL,'2026-09-02 03:25:36','2026-09-02 03:28:45'),(129,'App\\Models\\User',1,'auth_token','274abab13d062a92e4e46d35fcca4eb3addc0635c96a84c22f569a6eaba02813','[\"*\"]','2026-09-02 03:40:17',NULL,'2026-09-02 03:29:03','2026-09-02 03:40:17');
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `platform_settings`
--

DROP TABLE IF EXISTS `platform_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_settings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `platform_settings_key_unique` (`key`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `platform_settings`
--

LOCK TABLES `platform_settings` WRITE;
/*!40000 ALTER TABLE `platform_settings` DISABLE KEYS */;
INSERT INTO `platform_settings` VALUES (1,'base_commission_rate','0.10','Default platform commission rate (10%)','2026-09-01 09:46:27','2026-09-01 09:46:27'),(2,'category_commission_overrides','{\"food-beverage\":0.08,\"food-grocery\":0.08,\"food_and_grocery\":0.08,\"groceries\":0.08}','Category-specific commission overrides (Food & Grocery = 8%)','2026-09-01 09:46:27','2026-09-01 09:46:27'),(3,'gcash_merchant_name','VELURE OFFICIAL','Official GCash Merchant Name','2026-09-01 09:46:27','2026-09-01 09:46:27'),(4,'gcash_merchant_number','0917-835-8731','Official GCash Merchant Mobile Number','2026-09-01 09:46:27','2026-09-01 09:46:27');
/*!40000 ALTER TABLE `platform_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_images`
--

DROP TABLE IF EXISTS `product_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_images_product_id_index` (`product_id`),
  CONSTRAINT `product_images_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_images`
--

LOCK TABLES `product_images` WRITE;
/*!40000 ALTER TABLE `product_images` DISABLE KEYS */;
INSERT INTO `product_images` VALUES (1,1,'products/images/5cg6IK6eGNongybPaLc4nnwHjZUio7hW9mYh1DeU.jpg',1,0,'2026-08-26 22:51:06','2026-08-26 22:51:06'),(2,1,'products/images/pzWE2xnbUPu3Sjm31AN7mRJF1UU4va2J3RL00HjP.png',0,1,'2026-08-26 22:51:06','2026-08-26 22:51:06'),(3,1,'products/images/FQqi6t6pVjsVU4CkA2X3NXXYSWkJicbBaZRzbCsr.png',0,2,'2026-08-26 22:51:06','2026-08-26 22:51:06'),(4,2,'products/images/a1dACyxVR9JcQDTgxx3TKHfJYTMx51CLziACuiV8.png',1,0,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(5,2,'products/images/NW6t556JO7tbfsCX9chrdorOkOBpvqa4kv1k7Jzc.png',0,1,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(6,2,'products/images/mx7kODrGlyo7UUVOEwfgSv56cYrRkqFsIptgAnYY.png',0,2,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(7,2,'products/images/mrGcxBiamZbJpb5LT5PaK0R6mF45q5UU8FUiDisk.png',0,3,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(8,3,'products/images/on9FQxAHcuanlJFQlg9ahhwVVKFrodzydfPGWC9D.png',1,0,'2026-08-27 00:10:49','2026-08-27 00:10:49'),(9,3,'products/images/5auWGRg9rm2ifl4gzYY21ScL6zEk4TeHFfDPU7Ac.png',0,1,'2026-08-27 00:10:49','2026-08-27 00:10:49'),(10,3,'products/images/4MMIbXvc1qhbroBluYNlNj9CCk8amshUTwEGUgrN.png',0,2,'2026-08-27 00:10:49','2026-08-27 00:10:49'),(11,3,'products/images/KSNI2TwHUPkeXYaWICHkt9wgtKF6j8TZsclNMcTV.png',0,3,'2026-08-27 00:10:49','2026-08-27 00:10:49'),(12,4,'products/images/MCc0bllC4kHrfOjdbPeXQC8hPLgjdec2PgYMLSyD.png',1,0,'2026-08-27 00:28:25','2026-08-27 00:28:25'),(13,4,'products/images/pmyrMF3QZrqDS077Kq4hGh1rY0ImiNaiVqBNutr1.png',0,1,'2026-08-27 00:28:25','2026-08-27 00:28:25'),(14,4,'products/images/syBPiyhSgcN5ZiqTy9jziiZwF1iEy2cPE5pqLKG6.png',0,2,'2026-08-27 00:28:25','2026-08-27 00:28:25'),(15,4,'products/images/Bx1z3ijdUdJUL9kfFCFDtrHL8PLExKYj2GR25d0H.png',0,3,'2026-08-27 00:28:25','2026-08-27 00:28:25'),(16,5,'products/images/x7RnZNKV8tau8Coc98zBGwELMXb5bYhwQGA55uYy.png',1,0,'2026-08-27 00:35:59','2026-08-27 00:35:59'),(17,5,'products/images/zFK05JJDFs0hPg0lAlwGzGnxPgT5MdoVRM1hX9iB.png',0,1,'2026-08-27 00:35:59','2026-08-27 00:35:59'),(18,6,'products/images/VDxMwFOVwmnfPD4FemeUQFKo6Qgg1KzfLmE9nw91.jpg',1,0,'2026-08-27 01:20:04','2026-08-27 01:20:04'),(19,7,'products/images/dmoYF6t4Zye13aHGoRQ744QsnWCijZNnp5aVvJT8.jpg',1,0,'2026-08-27 03:49:24','2026-08-27 03:49:24'),(20,8,'products/images/GCvf9JLcyJlgwiiq6znLwfAItDy857YYgx4F3Lt4.avif',1,0,'2026-09-01 05:47:07','2026-09-01 05:47:07'),(21,8,'products/images/wIBlC9LKvIu441H3fP6nUB4RHKClHYqOvL5s4yfa.jpg',0,1,'2026-09-01 05:47:07','2026-09-01 05:47:07');
/*!40000 ALTER TABLE `product_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_variants`
--

DROP TABLE IF EXISTS `product_variants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_variants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `product_id` bigint unsigned NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sku` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `original_price` decimal(10,2) DEFAULT NULL,
  `stock_quantity` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_variants_product_id_index` (`product_id`),
  CONSTRAINT `product_variants_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_variants`
--

LOCK TABLES `product_variants` WRITE;
/*!40000 ALTER TABLE `product_variants` DISABLE KEYS */;
INSERT INTO `product_variants` VALUES (4,1,'Main autograph',NULL,99.00,NULL,100,'2026-08-26 23:48:43','2026-08-26 23:48:43'),(5,1,'nigger',NULL,99.00,NULL,100,'2026-08-26 23:48:43','2026-08-26 23:48:43'),(6,1,'white',NULL,99.00,NULL,100,'2026-08-26 23:48:43','2026-08-26 23:48:43'),(7,2,'red',NULL,150.00,NULL,100,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(8,2,'blue',NULL,150.00,NULL,100,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(9,2,'green',NULL,150.00,NULL,100,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(10,2,'yellow',NULL,150.00,NULL,100,'2026-08-27 00:01:44','2026-08-27 00:01:44'),(27,5,'piatos',NULL,150.00,NULL,100,'2026-08-27 01:09:06','2026-08-27 01:09:06'),(28,5,'nova',NULL,150.00,NULL,100,'2026-08-27 01:09:06','2026-08-27 01:09:06'),(29,4,'nigga',NULL,25.00,NULL,25,'2026-08-27 01:09:39','2026-08-27 01:09:39'),(30,4,'whiteboi',NULL,25.00,NULL,25,'2026-08-27 01:09:39','2026-08-27 01:09:39'),(31,4,'blackboi',NULL,25.00,NULL,25,'2026-08-27 01:09:39','2026-08-27 01:09:39'),(32,4,'asian',NULL,25.00,NULL,25,'2026-08-27 01:09:39','2026-08-27 01:09:39'),(33,3,'red',NULL,99.00,NULL,100,'2026-08-27 01:11:38','2026-08-27 01:11:38'),(34,3,'blue',NULL,99.00,NULL,100,'2026-08-27 01:11:38','2026-08-27 01:11:38'),(35,3,'green',NULL,99.00,NULL,100,'2026-08-27 01:11:38','2026-08-27 01:11:38'),(36,3,'violet',NULL,99.00,NULL,100,'2026-08-27 01:11:38','2026-08-27 01:11:38'),(41,7,'Default',NULL,1000000.00,NULL,1,'2026-08-27 03:49:24','2026-08-30 05:41:03'),(42,6,'Default',NULL,24.00,NULL,500,'2026-08-30 06:08:04','2026-08-30 06:08:04'),(43,8,'Regular Coke / 250ml',NULL,42.00,NULL,150,'2026-09-01 05:47:07','2026-09-01 05:47:07'),(44,8,'Regular Coke / 1L',NULL,58.00,NULL,150,'2026-09-01 05:47:07','2026-09-01 05:47:07'),(45,8,'Regular Coke / 1.5L',NULL,82.00,NULL,150,'2026-09-01 05:47:07','2026-09-01 05:47:07'),(46,8,'Coke Zero / 250ml',NULL,42.00,NULL,150,'2026-09-01 05:47:07','2026-09-01 05:47:07'),(47,8,'Coke Zero / 1L',NULL,58.00,NULL,150,'2026-09-01 05:47:07','2026-09-01 05:47:07'),(48,8,'Coke Zero / 1.5L',NULL,82.00,NULL,150,'2026-09-01 05:47:07','2026-09-01 05:47:07');
/*!40000 ALTER TABLE `product_variants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `seller_id` bigint unsigned NOT NULL,
  `category_id` bigint unsigned DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `base_price` decimal(10,2) NOT NULL,
  `original_price` decimal(10,2) DEFAULT NULL,
  `status` enum('draft','pending_review','active','rejected','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `archive_reason` text COLLATE utf8mb4_unicode_ci,
  `archived_by` enum('admin','seller') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `units_sold` bigint unsigned NOT NULL DEFAULT '0',
  `avg_rating` decimal(3,2) DEFAULT NULL,
  `review_count` int unsigned NOT NULL DEFAULT '0',
  `weight_kg` decimal(8,3) DEFAULT NULL,
  `dimension_l_cm` decimal(8,2) DEFAULT NULL,
  `dimension_w_cm` decimal(8,2) DEFAULT NULL,
  `dimension_h_cm` decimal(8,2) DEFAULT NULL,
  `sku` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fda_lto_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fda_cpr_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `net_weight_volume` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_best_before` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ingredients` text COLLATE utf8mb4_unicode_ci,
  `storage_instructions` text COLLATE utf8mb4_unicode_ci,
  `allergen_info` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `products_seller_id_index` (`seller_id`),
  KEY `products_category_id_index` (`category_id`),
  KEY `products_status_index` (`status`),
  CONSTRAINT `products_category_id_foreign` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `products_seller_id_foreign` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,2,NULL,'Johnny Sins authograph',NULL,99.00,NULL,'draft',NULL,NULL,NULL,0,NULL,0,NULL,NULL,NULL,NULL,NULL,'products/fda/9qxjHQiTo3qdmSa2Ep7VulKGjdajf7AMsfgfionD.png','products/fda/LhTnvffGPyOot0BdyKNQdvNPm19GpLYoNlk7CBAV.png',NULL,NULL,NULL,NULL,NULL,'2026-08-26 22:51:06','2026-08-27 00:08:31','2026-08-27 00:08:31'),(2,2,NULL,'basta','basta',150.00,NULL,'draft',NULL,NULL,NULL,0,NULL,0,2.000,3.00,5.00,3.00,NULL,'products/fda/iB1vgIrOCSPz2lFJwV300jnQUY473P0lFKgNrJDK.png','products/fda/JEavwu65OooHgPujXTFoIsYAXe8KTXAZp8VzKK68.png','250g','2 years','wala','wala','wala','2026-08-27 00:01:44','2026-08-27 00:08:29','2026-08-27 00:08:29'),(3,2,57,'oo','lala mo',99.00,NULL,'active',NULL,NULL,NULL,0,NULL,0,2.000,4.00,3.00,4.00,NULL,'products/fda/HnE6zeac9OCTTt5nezfmlStZiOFK4vqy1EypjvRQ.png','products/fda/pMVcFxnPCIYXifbIwGqWLeJt2dTSkxvdbK50r01U.png','250g','3 years','wala','wala','wala','2026-08-27 00:10:49','2026-08-30 04:47:28',NULL),(4,2,58,'c2','asdasdaw',25.00,NULL,'draft',NULL,NULL,NULL,0,NULL,0,3.000,4.00,5.00,4.00,NULL,'products/fda/ilt9y1RbqLMkjAXKNlCVimwhnVjClcTbAkCD5yF8.jpg','products/fda/XyCyVnpei4y37BfDjLqKBW2oqpaj6lfTZNhPtvcP.png','250ml','4 yrs','wala','meron ata','wala','2026-08-27 00:28:25','2026-08-27 01:09:39',NULL),(5,2,58,'megan young','edi wow',150.00,NULL,'active',NULL,'BAS2S!',NULL,0,NULL,0,4.000,4.00,5.00,4.00,NULL,'products/fda/DsYKOqwx9sfHi9N9Zwfu0JJvimN42uzRvaGt7aJ4.png','products/fda/5jOJQR4170XX533zV8ZWIylb8TmizsAeDyKWhzWD.png','250g','100 years','wala','ewan','wala, meron kang ano basta si kardo ka','2026-08-27 00:35:59','2026-08-30 04:53:08',NULL),(6,2,58,'Mountain Dew ni LexiLore','akin ang buwan na to!',24.00,NULL,'rejected','BAS2S!','BAS2S!','admin',0,NULL,0,1.500,4.00,5.00,4.00,NULL,'products/fda/iLXmzY9EQYSWqjlKAbe6UZ0QR61Su9WckjRFjgBC.png','products/fda/Uy9TupHWBTPyRuVYPletcwmxrQzaUDDe15vpEnaS.png','250g','1 million years','mountain dew ni lexi lore','sugar','gatas','2026-08-27 01:20:04','2026-08-30 06:08:54',NULL),(7,2,69,'ML ACCOUNT','BASTA MAHAL TO',1000000.00,NULL,'pending_review',NULL,NULL,NULL,0,NULL,0,2.000,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-27 03:49:24','2026-08-27 03:49:24',NULL),(8,2,58,'Coca Cola','<p dir=\"ltr\">Ice-cold, crisp, and refreshingly familiar — Coca-Cola is the world\'s most iconic soft drink, delivering that signature fizzy sweetness in every sip. Perfect for pairing with meals, sharing at gatherings, or enjoying on its own.</p><p dir=\"ltr\"><br></p>\r\n<ul dir=\"ltr\">\r\n<li><b>Classic cola flavor</b></li>\r\n<li><b>Best served chilled</b></li>\r\n<li><b>Available in various sizes (e.g. 250ml, 1L, 1.5L)</b></li>\r\n<li><b>Store in a cool, dry place away from direct sunlight</b></li></ul><div><b><br></b></div><div><img src=\"http://localhost:8000/storage/products/descriptions/N8eMZzwHZWTmuaRV2OGBr0ckHjd619dEAWvvgWY1.jpg\" style=\"border-radius: 8px; margin: 8px 0px;\" alt=\"Product image\"></div>',42.00,NULL,'active',NULL,NULL,NULL,0,NULL,0,2.000,4.00,5.00,4.00,NULL,'products/fda/aJ7H30R9nB6Ma0BIm7kvizWb305MHzO5WmgwZGhv.jpg','products/fda/dXHCGYyKkoEq9LAkM1DcngkSRsR9K4hxx1C1FBLe.jpg','250g','3 years','Cokes Secret Ingredients','basta','None','2026-09-01 05:47:07','2026-09-01 08:54:01',NULL);
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
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
  CONSTRAINT `reviews_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `reviews_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT
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
  `shop_bio` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date NOT NULL,
  `government_id_type` enum('national_id','drivers_license','passport','umid','sss_id','philhealth_id','voters_id','postal_id','school_id') COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_number` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_number_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `government_id_image_back_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `selfie_with_id_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `business_permit_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dti_sec_registration_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fda_lto_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_province` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_barangay` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_street` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shop_contact_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `return_policy` text COLLATE utf8mb4_unicode_ci,
  `shipping_policy` text COLLATE utf8mb4_unicode_ci,
  `business_hours` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `response_time` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banner_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_profiles`
--

LOCK TABLES `seller_profiles` WRITE;
/*!40000 ALTER TABLE `seller_profiles` DISABLE KEYS */;
INSERT INTO `seller_profiles` VALUES (1,2,'cp REPAIR SHOP MONG HAYUP KA!!!','Food & Beverage','MGA BOLD BINEBENTA KO!','Carbon-based oxygen enthusiast. Very bumbling clumsy pseudo-powerhouse quasi-scatterbrain.','2005-12-04','national_id','eyJpdiI6Imd1UWVpUVk0dWlPSjZFQ3hvQ1hDaXc9PSIsInZhbHVlIjoicDloUWdvWEZ3VjkxMUtsM2dpbjNhQT09IiwibWFjIjoiNjA3YjllYzRjOWU3ZjQ1MGQ0NDk3Yjc3ZTRlOTQ4NDhkYjhkNTQ1YWQyZjkzMTZkNDk5YmE3OGI4YzFmODU3MyIsInRhZyI6IiJ9','596175bfd5f0e792b434793f5dc35f8eabfabb76e720e5b52f60d733c25b06ee','government_ids/MedbxwPh6JfVRv3mBH4E7UxIQHe2nv0c2asHrg5H.png',NULL,'selfies/LGInY2nbsXdObp8GIjCY9tqtYc3EeaXWHqE6gxOW.png','business_permits/2zy9sMPsxgMuuasMbLyalqbam5Qqd1xoLNyyILFg.png','dti_sec_registrations/VzFK9lrR6MFVSARNkoHaBAPDr8fa6EuUTuYj7uHZ.png',NULL,'031400000','031403000','031403002','Brgy. Pitiwpiwpiwwiwiw','+639694089045','Returns and refunds are accepted within 3 days of delivery for damaged or incorrect items, with original packaging and proof of purchase required.','Orders are processed within 1-3 business days and shipped with estimated delivery of 2-10 business days depending on location; shipping fees apply based on destination and package size','Everyday | 7 AM - 9 PM','within_1_hour','shops/logos/zuMtE5GjzN3KpwN4LWRBQ7F6M3ayMVWV8KyJy2q5.jpg','shops/banners/7SwgAlzAu5XfJQmZNFwiYkP0qSTXKAi5IDXXRcTU.png','eyJpdiI6ImZocHp1V2M2L3pyMUh1TFplVjlrUHc9PSIsInZhbHVlIjoiZHU4Q2JJQ2xNYzFPTWlTSEh4bHJIdz09IiwibWFjIjoiYmNiZDI0MmNiNjAzMjY1ZDU3YzEwNGNjOWJkMjY2ZDBiMDZiYTFmMDgzYzVkNWQyNjlhMmFiNmU1MWNlMWU1NCIsInRhZyI6IiJ9','approved',NULL,1,'2026-08-23 08:02:28','2026-08-23 08:02:08','2026-08-23 07:20:05','2026-08-31 06:25:21',NULL);
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
-- Table structure for table `store_follows`
--

DROP TABLE IF EXISTS `store_follows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `store_follows` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `seller_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `store_follows_user_id_seller_id_unique` (`user_id`,`seller_id`),
  KEY `store_follows_seller_id_index` (`seller_id`),
  CONSTRAINT `store_follows_seller_id_foreign` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `store_follows_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `store_follows`
--

LOCK TABLES `store_follows` WRITE;
/*!40000 ALTER TABLE `store_follows` DISABLE KEYS */;
INSERT INTO `store_follows` VALUES (2,2,2,'2026-09-01 04:03:50','2026-09-01 04:03:50');
/*!40000 ALTER TABLE `store_follows` ENABLE KEYS */;
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
  `government_id_type` enum('national_id','drivers_license','passport','umid','sss_id','philhealth_id','voters_id','postal_id','school_id') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Velure',NULL,'Admin','admin@gmail.com','+639000000000',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$ODvgcYgpVABm.1JZc1cZ.eWTAMBLnsrX5FXo0LlLKta8ZBBFs3whK','admin','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-12 08:59:54','2026-08-12 14:57:56',NULL),(2,'Jay Mark',NULL,'Del Valle','jaymarkdelvalle42@gmail.com','+639898912348','2005-12-04','male','national_id','buyer-ids/qmk5BEKOHmbYax3LCLspwVe2fpoNJ2ViGWGmV7U9.png',NULL,'approved',NULL,'avatars/1at8lAIObyo0bo1jPUhQFgP4o6i3IfYA0xgDm1YT.jpg','$2y$12$pW6Z3Kq2wxZ61I2BJga13.Br3rMYGdE2VivNo/RdbUS5Eq6OKiQT6','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-12 12:30:16','2026-08-19 21:30:11',NULL),(3,'Faker',NULL,'Delvalle','fakerdelvalle22@gmail.com','+639688678679','2001-08-01','male','drivers_license','buyer-ids/29nz8XI3WCAgR6FqCzvqy7ymwnNfuSFaq8evo64b.jpg','buyer-ids/LMQpeZR9RR4mgptXLiKWKgEho5sHJ0NlFWOhwIfX.png','pending',NULL,'avatars/L3t8CHuw8MyJjmJukiHNucaCrZQvmBM2L24Uq01I.png','$2y$12$10lwmq9bx0za6s/dZGT0Yec17MDgqNQ1doR.ZyQO.p3mBpEuRaZEa','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-12 14:56:15','2026-08-19 22:58:32',NULL),(4,'Johnny',NULL,'Sins','legenddelvalle42@gmail.com','+639456456456',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$jELkc.eUeQIfu/CIpqBgy.cPkybvqkT5nxXrbmK9d0cmRq2KktqRq','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-13 00:20:07','2026-08-18 20:54:00',NULL),(5,'Medi',NULL,'Moms','carlanderson22k@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$UphUQOtWiDwQztgSHt3D/uG7VCx4yAB45MYOUdVgoRqd2r6tSZBY2','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-17 19:28:06','2026-08-17 19:28:06',NULL),(6,'Sammuel',NULL,'Del Valle','sammueldelvalle22@gmail.com','+639768679679','1994-04-07','male','national_id','buyer-ids/2swdITIjZy7koVOtbvoK1CHOBwVfJIeO5QBUl8da.png',NULL,'pending',NULL,NULL,'$2y$12$7gqY22BkViBLZ0IhGEH8au5BEjaFQ0mIYMXENm1sSpi1JQ6WmRQmW','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-17 19:28:30','2026-08-19 00:22:52',NULL),(7,'Rafael',NULL,'delvalle','arpiedelvalle.1978@gmail.com','+639768978079','1989-10-15','male','drivers_license','buyer-ids/uFRVL3hldbZ0p1lPRS1U9oYSdp04MdTLcKgOWVUK.png',NULL,'pending',NULL,NULL,'$2y$12$I/VZxrXKg/00l4LyrOMwO.vyGqCWMKYlkQxefYFMTvwNioiGIKx0a','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-17 19:49:20','2026-08-19 03:40:50',NULL),(8,'Romulo, Jules Andrei M.',NULL,'User','romulojules123@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$Vo3Im.BKkqEoy.z/M025z./caiLaSHbOCchXTuxD8hgCT6pXVRKFS','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-19 00:35:32','2026-08-19 00:35:32',NULL),(9,'Andrew',NULL,'Espino','andrewespino478@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$ysUnHSKqfa8XtjbZpxXIM.50ienOj00Wf7F7QtKY6HLj9NDFUgvoS','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-19 00:55:23','2026-08-19 00:55:23',NULL),(10,'BIG',NULL,'Boi','bboi.1234.15@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$gME/J2WT9M4EKX/T3jYs9eXEHrUUMSS7gDdlx8Xo0grOIiplz3zBW','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-19 00:59:45','2026-08-19 00:59:45',NULL),(11,'Chito',NULL,'Miranda','mirandachito62@gmail.com','+639809091233','1997-08-08','male','umid','buyer-ids/SvPnHd4yNFNuQERXBAezDJqSt4SX8FpLP6Ck8jej.png','buyer-ids/FbcoAQiAlrVWVWZfvQG5kXL6SwVUOiMIXQzxsIxr.png','pending',NULL,NULL,'$2y$12$zF8qkQiguw/AuV8Q9nu4wu51EQt/X6eMugBzrv5bwvuOx5f020HZ6','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-22 00:49:04','2026-08-22 00:50:03',NULL),(12,'lennon',NULL,'delvalle','lennon.delvalle.15@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'$2y$12$iQiiGQi0N6k1xwnRu4.qVuBB00Cs9taWAXSnoqUBQAscqjHWTsPvK','buyer','active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-08-23 03:37:12','2026-09-01 05:03:15',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wishlist_items`
--

DROP TABLE IF EXISTS `wishlist_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wishlist_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wishlist_id` bigint unsigned NOT NULL,
  `product_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wishlist_items_wishlist_id_product_id_unique` (`wishlist_id`,`product_id`),
  KEY `wishlist_items_product_id_index` (`product_id`),
  CONSTRAINT `wishlist_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `wishlist_items_wishlist_id_foreign` FOREIGN KEY (`wishlist_id`) REFERENCES `wishlists` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wishlist_items`
--

LOCK TABLES `wishlist_items` WRITE;
/*!40000 ALTER TABLE `wishlist_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `wishlist_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wishlists`
--

DROP TABLE IF EXISTS `wishlists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wishlists` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wishlists_user_id_unique` (`user_id`),
  CONSTRAINT `wishlists_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wishlists`
--

LOCK TABLES `wishlists` WRITE;
/*!40000 ALTER TABLE `wishlists` DISABLE KEYS */;
INSERT INTO `wishlists` VALUES (1,2,'2026-08-31 06:08:42','2026-08-31 06:08:42');
/*!40000 ALTER TABLE `wishlists` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-02 19:52:12
