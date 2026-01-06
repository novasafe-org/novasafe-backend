/**
 * Welcome Item Service
 * 
 * Creates a welcome item for new users when they first access the vault.
 * This item is created automatically in the Personal folder.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import logger from '../logger';
import crypto from 'crypto';

const collection = DBCONFIG.vault.collections;

/**
 * Create welcome item for user
 * This creates a password item with user's information
 * 
 * Note: Since we use zero-knowledge encryption, this item will be created
 * in legacy format. The frontend can later encrypt it if needed.
 * 
 * @param userId - User ID
 * @param userName - User's full name
 * @param userEmail - User's email
 * @param userPassword - User's login password (optional, can be empty)
 * @returns Created item or null if already exists
 */
export const createWelcomeItem = async (
  userId: string,
  userName: string,
  userEmail: string,
  userPassword?: string
): Promise<any | null> => {
  try {
    const db = new Database('vault');
    const userIdObj = new ObjectId(userId);

    // Check if welcome item already exists
    // We'll identify it by the _isWelcomeItem flag
    const existingWelcomeItem = await db.findOne(collection.vaultItems, {
      userId: userIdObj,
      _isWelcomeItem: true,
      category: 'password',
      deleted: { $ne: true },
    });

    if (existingWelcomeItem) {
      logger.info(`Welcome item already exists for user ${userId}`);
      return null;
    }

    // Find or create Personal folder
    let personalFolder = await db.findOne(collection.folders, {
      userId: userIdObj,
      name: 'Personal',
    });

    let personalFolderId: ObjectId | null = null;
    
    if (!personalFolder) {
      // Create Personal folder if it doesn't exist
      const newPersonalFolder: any = {
        userId: userIdObj,
        name: 'Personal',
        description: 'Default safe for your personal items',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const folderResult = await db.insertOne(collection.folders, newPersonalFolder);
      personalFolderId = folderResult.insertedId;
      logger.info(`Personal folder created for welcome item, userId: ${userId}`);
    } else {
      personalFolderId = personalFolder._id;
    }

    // Create beautiful welcome note
    const welcomeNote = `🎉 Welcome to NovaSafe! 🎉

Your journey to secure digital life management begins here. This is your personal vault where you can safely store:

• Passwords and login credentials
• Personal identification documents
• Financial information
• Medical records
• Important documents and files
• Secure notes

Everything you store here is encrypted with zero-knowledge architecture, meaning only you can access your data. We can't see it, and neither can anyone else.

Start by exploring the different categories available, or add your first item using the "+" button.

Your security is our priority. Welcome aboard! 🚀`;

    // Create welcome item in legacy format (since we can't encrypt without user's key)
    // The frontend can later migrate this to encrypted format
    const welcomeItem: any = {
      userId: userIdObj,
      category: 'password',
      title: userName || userEmail, // User's full name as title
      username: userName || userEmail, // Username field same as title
      password: userPassword || '', // User's login password if available (empty if not set)
      email: userEmail,
      url: '',
      notes: welcomeNote,
      folderId: personalFolderId,
      isFavorite: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deleted: false,
      accessCount: 0,
      lastAccessedAt: null,
      // Mark as welcome item for identification
      _isWelcomeItem: true,
      // Mark as legacy format (will be encrypted by frontend later)
      _legacyFormat: true,
    };

    const result = await db.insertOne(collection.vaultItems, welcomeItem);
    
    logger.info(`Welcome item created for user ${userId}, itemId: ${result.insertedId}`);
    
    return {
      ...welcomeItem,
      _id: result.insertedId,
      id: result.insertedId.toString(),
    };
  } catch (error: any) {
    logger.error(`Error creating welcome item for user ${userId}: ${error.message}`);
    throw error;
  }
};

/**
 * Check if user has a welcome item
 * @param userId - User ID
 * @returns true if welcome item exists
 */
export const hasWelcomeItem = async (userId: string): Promise<boolean> => {
  try {
    const db = new Database('vault');
    const userIdObj = new ObjectId(userId);

    const welcomeItem = await db.findOne(collection.vaultItems, {
      userId: userIdObj,
      _isWelcomeItem: true,
      category: 'password',
      deleted: { $ne: true },
    });

    return !!welcomeItem;
  } catch (error: any) {
    logger.error(`Error checking welcome item for user ${userId}: ${error.message}`);
    return false;
  }
};

