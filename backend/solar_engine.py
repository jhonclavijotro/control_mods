from datetime import datetime, time, timedelta

SOLAR_START_HOUR = 7  # 7:00 AM
SOLAR_END_HOUR = 18   # 6:00 PM
DAILY_SOLAR_HOURS = SOLAR_END_HOUR - SOLAR_START_HOUR  # 11.0 hours

def calculate_solar_hours_in_range(start_dt: datetime, end_dt: datetime) -> float:
    """
    Calculates total hours between start_dt and end_dt that fall strictly within
    the daily 07:00 AM to 06:00 PM solar operating window.
    """
    if not start_dt or not end_dt or start_dt >= end_dt:
        return 0.0

    total_seconds = 0.0
    current_day = start_dt.date()
    end_day = end_dt.date()

    while current_day <= end_day:
        solar_start = datetime.combine(current_day, time(SOLAR_START_HOUR, 0, 0))
        solar_end = datetime.combine(current_day, time(SOLAR_END_HOUR, 0, 0))

        # Determine overlap between [start_dt, end_dt] and [solar_start, solar_end]
        overlap_start = max(start_dt, solar_start)
        overlap_end = min(end_dt, solar_end)

        if overlap_start < overlap_end:
            total_seconds += (overlap_end - overlap_start).total_seconds()

        current_day += timedelta(days=1)

    return round(total_seconds / 3600.0, 2)

def calculate_module_metrics(installed_at: datetime, repair_logs, current_time: datetime = None, period_start: datetime = None) -> dict:
    """
    Computes cumulative solar operating hours, downtime hours during solar windows,
    availability percentage, and MTBF for a given power module over a specified period window.
    """
    if current_time is None:
        current_time = datetime.utcnow()

    # Determine baseline evaluation window start date.
    if not installed_at:
        eval_start = current_time - timedelta(days=30)
    else:
        eval_start = installed_at

    if period_start:
        eval_start = max(eval_start, period_start)

    # Total potential solar hours from eval_start until current_time
    total_potential_solar_hours = calculate_solar_hours_in_range(eval_start, current_time)

    # Calculate total repair downtime within solar working hours
    solar_downtime_hours = 0.0
    total_repairs_count = 0

    if repair_logs:
        for log in repair_logs:
            stop = log.stop_time
            restart = log.restart_time if log.restart_time else current_time
            # Ensure window overlap with [eval_start, current_time]
            window_stop = max(stop, eval_start)
            window_restart = min(restart, current_time)
            if window_stop < window_restart:
                total_repairs_count += 1
                downtime_in_window = calculate_solar_hours_in_range(window_stop, window_restart)
                solar_downtime_hours += downtime_in_window

    net_operating_hours = max(0.0, total_potential_solar_hours - solar_downtime_hours)
    
    if total_potential_solar_hours > 0:
        uptime_percent = min(100.0, max(0.0, (net_operating_hours / total_potential_solar_hours) * 100.0))
    else:
        uptime_percent = 100.0

    # MTBF: Mean Time Between Failures in operating hours
    mtbf = net_operating_hours / (total_repairs_count + 1)

    return {
        "installed_at": installed_at.isoformat() if installed_at else eval_start.isoformat(),
        "total_potential_solar_hours": round(total_potential_solar_hours, 1),
        "solar_downtime_hours": round(solar_downtime_hours, 1),
        "net_operating_hours": round(net_operating_hours, 1),
        "uptime_percent": round(uptime_percent, 1),
        "total_repairs_count": total_repairs_count,
        "mtbf_hours": round(mtbf, 1)
    }
