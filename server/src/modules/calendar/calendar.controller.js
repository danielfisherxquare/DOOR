import { calendarService } from './calendar.service.js';

export async function getCalendarEvents(req, res, next) {
    try {
        const events = await calendarService.getEvents(req.authContext, req.query);

        res.json({ success: true, data: events });
    } catch (err) {
        next(err);
    }
}
