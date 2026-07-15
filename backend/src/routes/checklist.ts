/**
 * Checklist Routes
 * Handles trade show checklist management (flights, hotels, car rentals, booth shipping, custom items, templates)
 */

import express, { Response, NextFunction } from 'express';
import { authorize, AuthRequest } from '../middleware/auth';
import { uploadBoothMap } from '../config/upload';
import { checklistRepository } from '../database/repositories';
import { pushService, PushPayload } from '../services/PushService';
import multer from 'multer';
import fs from 'fs';

const router = express.Router();

/**
 * Fire-and-forget push notification for booking confirmations.
 * Never delays or fails the API response.
 */
const notifyBooking = (userId: string | null | undefined, payload: PushPayload): void => {
  if (!userId) return;
  void pushService.sendToUser(userId, payload).catch((error) => {
    console.error('[Checklist] Failed to send booking notification:', error);
  });
};

/**
 * Format a date value for notification bodies (dates come back from pg as Date or string).
 */
const formatNotificationDate = (value?: string | Date | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Get checklist for an event (all authenticated users can view)
router.get('/:eventId', authorize('admin', 'coordinator', 'developer', 'accountant', 'salesperson'), async (req: AuthRequest, res: Response) => {
  try {
    const { eventId } = req.params;

    // Get or create checklist
    let checklist = await checklistRepository.findByEventId(eventId);
    
    if (!checklist) {
      // Create checklist if it doesn't exist
      checklist = await checklistRepository.create(eventId);
      console.log(`[Checklist] Created new checklist for event ${eventId}`);
    }

    // Fetch all related data in parallel
    const [flights, hotels, carRentals, boothShipping, customItems] = await Promise.all([
      checklistRepository.getFlights(checklist.id),
      checklistRepository.getHotels(checklist.id),
      checklistRepository.getCarRentals(checklist.id),
      checklistRepository.getBoothShipping(checklist.id),
      checklistRepository.getCustomItems(checklist.id)
    ]);

    // Return complete checklist object with all arrays
    res.json({
      ...checklist,
      flights: flights || [],
      hotels: hotels || [],
      carRentals: carRentals || [],
      boothShipping: boothShipping || [],
      customItems: customItems || []
    });
  } catch (error) {
    console.error('[Checklist] Error fetching checklist:', error);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

// Update checklist main fields (booth, electricity)
router.put('/:checklistId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const { boothOrdered, boothNotes, electricityOrdered, electricityNotes } = req.body;

    const checklist = await checklistRepository.updateMainFields(parseInt(checklistId), {
      boothOrdered,
      boothNotes,
      electricityOrdered,
      electricityNotes
    });

    res.json(checklist);
  } catch (error) {
    console.error('[Checklist] Error updating checklist:', error);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// Multer error handler middleware (Express error middleware with 4 parameters)
const handleMulterError = (err: any, req: AuthRequest, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.error(`[Checklist] Multer error: ${err.code} - ${err.message}`, {
      field: err.field,
      code: err.code,
      message: err.message
    });
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large',
        details: 'Maximum file size is 10MB. Please upload a smaller file.'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: 'Unexpected file field',
        details: `Expected field name: 'boothMap'. Received: ${err.field || 'unknown'}`
      });
    }
    
    return res.status(400).json({ 
      error: 'File upload failed',
      details: err.message || 'Invalid file upload. Please check file size and format.'
    });
  }
  
  // Handle fileFilter errors (thrown as regular Error)
  if (err) {
    console.error(`[Checklist] File validation error: ${err.message}`, {
      message: err.message,
      stack: err.stack
    });
    
    return res.status(400).json({ 
      error: 'File validation failed',
      details: err.message || 'Invalid file type. Only images (JPEG, PNG, GIF, HEIC, WebP) and PDF files are allowed.'
    });
  }
  
  next(err);
};

// Upload booth map
router.post('/:checklistId/booth-map', 
  authorize('admin', 'coordinator', 'developer'), 
  (req: AuthRequest, res: Response, next: NextFunction) => {
    uploadBoothMap.single('boothMap')(req, res, (err: any) => {
      if (err) {
        return handleMulterError(err, req, res, next);
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const { checklistId } = req.params;
      
      // Validate checklistId
      const checklistIdNum = parseInt(checklistId);
      if (isNaN(checklistIdNum)) {
        console.error(`[Checklist] Invalid checklistId: ${checklistId}`);
        return res.status(400).json({ error: 'Invalid checklist ID' });
      }

      // Check if file was uploaded
      if (!req.file) {
        console.error(`[Checklist] No file uploaded for checklist ${checklistId}`);
        return res.status(400).json({ 
          error: 'No file uploaded',
          details: 'Please select a file to upload.'
        });
      }

      console.log(`[Checklist] Processing booth map upload for checklist ${checklistId}:`, {
        originalname: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      });

      // Verify file exists on disk
      if (!fs.existsSync(req.file.path)) {
        console.error(`[Checklist] Uploaded file not found on disk: ${req.file.path}`);
        return res.status(500).json({ 
          error: 'File upload failed',
          details: 'File was not saved correctly. Please try again.'
        });
      }

      const mapUrl = `/uploads/booth-maps/${req.file.filename}`;

      // Update checklist with map URL
      const checklist = await checklistRepository.updateMainFields(checklistIdNum, {
        boothMapUrl: mapUrl
      });

      console.log(`[Checklist] ✓ Booth map uploaded successfully for checklist ${checklistId}: ${mapUrl}`);
      res.json({ mapUrl: checklist.booth_map_url });
    } catch (error: any) {
      // Handle specific error types
      if (error.message === 'Checklist not found') {
        console.error(`[Checklist] Checklist not found: ${req.params.checklistId}`);
        return res.status(404).json({ error: 'Checklist not found' });
      }
      
      // Handle file system errors
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.error(`[Checklist] Permission error uploading booth map:`, {
          message: error.message,
          code: error.code,
          path: req.file?.path
        });
        return res.status(500).json({ 
          error: 'File upload failed',
          details: 'Permission denied. Please contact administrator.'
        });
      }
      
      if (error.code === 'ENOENT') {
        console.error(`[Checklist] Directory not found:`, {
          message: error.message,
          code: error.code,
          path: error.path
        });
        return res.status(500).json({ 
          error: 'File upload failed',
          details: 'Upload directory not found. Please contact administrator.'
        });
      }
      
      // Handle database errors
      if (error.code === '23503') {
        console.error(`[Checklist] Foreign key constraint error:`, {
          message: error.message,
          code: error.code,
          checklistId: req.params.checklistId
        });
        return res.status(400).json({ 
          error: 'Invalid checklist',
          details: 'The checklist does not exist or has been deleted.'
        });
      }
      
      // Log full error details for debugging
      console.error('[Checklist] Error uploading booth map:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        checklistId: req.params.checklistId,
        file: req.file ? {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path
        } : 'no file'
      });
      
      res.status(500).json({ 
        error: 'Failed to upload booth map',
        details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred. Please try again.'
      });
    }
  }
);

// Delete booth map
router.delete('/:checklistId/booth-map', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;

    await checklistRepository.updateMainFields(parseInt(checklistId), {
      boothMapUrl: undefined
    });

    console.log(`[Checklist] Booth map deleted for checklist ${checklistId}`);
    res.json({ message: 'Booth map deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Checklist not found') {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    console.error('[Checklist] Error deleting booth map:', error);
    res.status(500).json({ error: 'Failed to delete booth map' });
  }
});

// Add flight
router.post('/:checklistId/flights', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const { attendeeId, attendeeName, carrier, confirmationNumber, notes, booked } = req.body;

    const flight = await checklistRepository.createFlight({
      checklistId: parseInt(checklistId),
      attendeeId,
      attendeeName,
      carrier,
      confirmationNumber,
      notes,
      booked: booked || false
    });

    if (flight.booked && flight.confirmation_number && flight.attendee_id) {
      notifyBooking(flight.attendee_id, {
        title: 'Flight booked ✈️',
        body: `Confirmation ${flight.confirmation_number}${flight.carrier ? ` · ${flight.carrier}` : ''}`,
        url: '/'
      });
    }

    res.json(flight);
  } catch (error) {
    console.error('[Checklist] Error adding flight:', error);
    res.status(500).json({ error: 'Failed to add flight' });
  }
});

// Update flight
router.put('/flights/:flightId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { flightId } = req.params;
    const { carrier, confirmationNumber, notes, booked } = req.body;

    const flight = await checklistRepository.updateFlight(parseInt(flightId), {
      carrier,
      confirmation_number: confirmationNumber,
      notes,
      booked
    });

    if (flight.booked && flight.confirmation_number && flight.attendee_id) {
      notifyBooking(flight.attendee_id, {
        title: 'Flight booked ✈️',
        body: `Confirmation ${flight.confirmation_number}${flight.carrier ? ` · ${flight.carrier}` : ''}`,
        url: '/'
      });
    }

    res.json(flight);
  } catch (error) {
    console.error('[Checklist] Error updating flight:', error);
    res.status(500).json({ error: 'Failed to update flight' });
  }
});

// Delete flight
router.delete('/flights/:flightId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { flightId } = req.params;
    await checklistRepository.deleteFlight(parseInt(flightId));
    res.json({ success: true });
  } catch (error) {
    console.error('[Checklist] Error deleting flight:', error);
    res.status(500).json({ error: 'Failed to delete flight' });
  }
});

// Add hotel
router.post('/:checklistId/hotels', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const { attendeeId, attendeeName, propertyName, confirmationNumber, checkInDate, checkOutDate, notes, booked } = req.body;

    const hotel = await checklistRepository.createHotel({
      checklistId: parseInt(checklistId),
      attendeeId,
      attendeeName,
      propertyName,
      confirmationNumber,
      checkInDate,
      checkOutDate,
      notes,
      booked: booked || false
    });

    if (hotel.booked && hotel.confirmation_number && hotel.attendee_id) {
      const checkIn = formatNotificationDate(hotel.check_in_date);
      notifyBooking(hotel.attendee_id, {
        title: 'Hotel booked 🏨',
        body: `Confirmation ${hotel.confirmation_number}${hotel.property_name ? ` · ${hotel.property_name}` : ''}${checkIn ? ` · Check-in ${checkIn}` : ''}`,
        url: '/'
      });
    }

    res.json(hotel);
  } catch (error) {
    console.error('[Checklist] Error adding hotel:', error);
    res.status(500).json({ error: 'Failed to add hotel' });
  }
});

// Update hotel
router.put('/hotels/:hotelId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { hotelId } = req.params;
    const { propertyName, confirmationNumber, checkInDate, checkOutDate, notes, booked } = req.body;

    const hotel = await checklistRepository.updateHotel(parseInt(hotelId), {
      property_name: propertyName,
      confirmation_number: confirmationNumber,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      notes,
      booked
    });

    if (hotel.booked && hotel.confirmation_number && hotel.attendee_id) {
      const checkIn = formatNotificationDate(hotel.check_in_date);
      notifyBooking(hotel.attendee_id, {
        title: 'Hotel booked 🏨',
        body: `Confirmation ${hotel.confirmation_number}${hotel.property_name ? ` · ${hotel.property_name}` : ''}${checkIn ? ` · Check-in ${checkIn}` : ''}`,
        url: '/'
      });
    }

    res.json(hotel);
  } catch (error) {
    console.error('[Checklist] Error updating hotel:', error);
    res.status(500).json({ error: 'Failed to update hotel' });
  }
});

// Delete hotel
router.delete('/hotels/:hotelId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { hotelId } = req.params;
    await checklistRepository.deleteHotel(parseInt(hotelId));
    res.json({ success: true });
  } catch (error) {
    console.error('[Checklist] Error deleting hotel:', error);
    res.status(500).json({ error: 'Failed to delete hotel' });
  }
});

// Add car rental
router.post('/:checklistId/car-rentals', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const { provider, confirmationNumber, pickupDate, returnDate, notes, booked, rentalType, assignedToId, assignedToName } = req.body;

    const rental = await checklistRepository.createCarRental({
      checklistId: parseInt(checklistId),
      provider,
      confirmationNumber,
      pickupDate,
      returnDate,
      notes,
      booked: booked || false,
      rentalType: rentalType || 'group',
      assignedToId: assignedToId || null,
      assignedToName: assignedToName || null
    });

    if (rental.booked && rental.confirmation_number && rental.assigned_to_id) {
      notifyBooking(rental.assigned_to_id, {
        title: 'Car rental booked 🚗',
        body: `Confirmation ${rental.confirmation_number}${rental.provider ? ` · ${rental.provider}` : ''}`,
        url: '/'
      });
    }

    res.json(rental);
  } catch (error) {
    console.error('[Checklist] Error adding car rental:', error);
    res.status(500).json({ error: 'Failed to add car rental' });
  }
});

// Update car rental
router.put('/car-rentals/:rentalId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { rentalId } = req.params;
    const { provider, confirmationNumber, pickupDate, returnDate, notes, booked, rentalType, assignedToId, assignedToName } = req.body;

    const rental = await checklistRepository.updateCarRental(parseInt(rentalId), {
      provider,
      confirmation_number: confirmationNumber,
      pickup_date: pickupDate,
      return_date: returnDate,
      notes,
      booked,
      rental_type: rentalType || 'group',
      assigned_to_id: assignedToId || null,
      assigned_to_name: assignedToName || null
    });

    if (rental.booked && rental.confirmation_number && rental.assigned_to_id) {
      notifyBooking(rental.assigned_to_id, {
        title: 'Car rental booked 🚗',
        body: `Confirmation ${rental.confirmation_number}${rental.provider ? ` · ${rental.provider}` : ''}`,
        url: '/'
      });
    }

    res.json(rental);
  } catch (error) {
    console.error('[Checklist] Error updating car rental:', error);
    res.status(500).json({ error: 'Failed to update car rental' });
  }
});

// Delete car rental
router.delete('/car-rentals/:rentalId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { rentalId } = req.params;
    await checklistRepository.deleteCarRental(parseInt(rentalId));
    res.json({ success: true });
  } catch (error) {
    console.error('[Checklist] Error deleting car rental:', error);
    res.status(500).json({ error: 'Failed to delete car rental' });
  }
});

// Add/Update booth shipping
router.post('/:checklistId/booth-shipping', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const { shippingMethod, carrierName, trackingNumber, shippingDate, deliveryDate, notes, shipped } = req.body;

    // Always insert a new booth shipping record (supports multiple shipments)
    const shipping = await checklistRepository.createBoothShipping({
      checklistId: parseInt(checklistId),
      shippingMethod,
      carrierName,
      trackingNumber,
      shippingDate,
      deliveryDate,
      notes,
      shipped: shipped || false
    });

    res.json(shipping);
  } catch (error) {
    console.error('[Checklist] Error saving booth shipping:', error);
    res.status(500).json({ error: 'Failed to save booth shipping' });
  }
});

// Delete booth shipping
router.delete('/booth-shipping/:shippingId', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { shippingId } = req.params;
    const deleted = await checklistRepository.deleteBoothShipping(parseInt(shippingId));
    
    if (!deleted) {
      return res.status(404).json({ error: 'Booth shipping entry not found' });
    }
    
    res.json({ message: 'Booth shipping entry deleted successfully' });
  } catch (error) {
    console.error('[Checklist] Error deleting booth shipping:', error);
    res.status(500).json({ error: 'Failed to delete booth shipping' });
  }
});

// ==========================================
// CUSTOM CHECKLIST ITEMS
// ==========================================

// Get custom items for a checklist
router.get('/:checklistId/custom-items', authorize('admin', 'coordinator', 'developer', 'accountant', 'salesperson'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const customItems = await checklistRepository.getCustomItems(parseInt(checklistId));
    res.json(customItems);
  } catch (error) {
    console.error('[Checklist] Error fetching custom items:', error);
    res.status(500).json({ error: 'Failed to fetch custom items' });
  }
});

// Create custom item
router.post('/:checklistId/custom-items', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const { title, description, position } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const customItem = await checklistRepository.createCustomItem({
      checklistId: parseInt(checklistId),
      title,
      description,
      position
    });
    
    res.json(customItem);
  } catch (error) {
    console.error('[Checklist] Error creating custom item:', error);
    res.status(500).json({ error: 'Failed to create custom item' });
  }
});

// Update custom item
router.put('/custom-items/:id', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, completed, position } = req.body;
    
    const customItem = await checklistRepository.updateCustomItem(parseInt(id), {
      title,
      description,
      completed,
      position
    });
    
    res.json(customItem);
  } catch (error: any) {
    if (error.message === 'CustomItem not found') {
      return res.status(404).json({ error: 'Custom item not found' });
    }
    console.error('[Checklist] Error updating custom item:', error);
    res.status(500).json({ error: 'Failed to update custom item' });
  }
});

// Delete custom item
router.delete('/custom-items/:id', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await checklistRepository.deleteCustomItem(parseInt(id));
    
    if (!deleted) {
      return res.status(404).json({ error: 'Custom item not found' });
    }
    
    res.json({ message: 'Custom item deleted successfully' });
  } catch (error) {
    console.error('[Checklist] Error deleting custom item:', error);
    res.status(500).json({ error: 'Failed to delete custom item' });
  }
});

// ==========================================
// CHECKLIST TEMPLATES
// ==========================================

// Get all templates
router.get('/templates', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const templates = await checklistRepository.getActiveTemplates();
    res.json(templates);
  } catch (error) {
    console.error('[Checklist] Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create template
router.post('/templates', authorize('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, position } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const template = await checklistRepository.createTemplate({
      title,
      description,
      position
    });
    
    res.json(template);
  } catch (error) {
    console.error('[Checklist] Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update template
router.put('/templates/:id', authorize('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, position, is_active } = req.body;
    
    const template = await checklistRepository.updateTemplate(parseInt(id), {
      title,
      description,
      position,
      is_active
    });
    
    res.json(template);
  } catch (error: any) {
    if (error.message === 'Template not found') {
      return res.status(404).json({ error: 'Template not found' });
    }
    console.error('[Checklist] Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template (soft delete)
router.delete('/templates/:id', authorize('admin', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await checklistRepository.softDeleteTemplate(parseInt(id));
    
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('[Checklist] Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Apply templates to a specific checklist
router.post('/:checklistId/apply-templates', authorize('admin', 'coordinator', 'developer'), async (req: AuthRequest, res: Response) => {
  try {
    const { checklistId } = req.params;
    const count = await checklistRepository.applyTemplatesToChecklist(parseInt(checklistId));
    
    res.json({ message: 'Templates applied successfully', count });
  } catch (error) {
    console.error('[Checklist] Error applying templates:', error);
    res.status(500).json({ error: 'Failed to apply templates' });
  }
});

export default router;

