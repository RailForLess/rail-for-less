import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useEffect, useState } from "react";
import "./Fares.css";
import Filters from "./Filters";
import Option from "./Option";
import Share from "./Share";
import RailwayAlertIcon from "@mui/icons-material/RailwayAlert";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import TablePagination from "@mui/material/TablePagination";
import { LineChart } from "@mui/x-charts/LineChart";
dayjs.extend(advancedFormat);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(timezone);
dayjs.extend(utc);

export default function Fares({
	roundTrip,
	flexible,
	travelerTypes,
	fareClass,
	setFareClasses,
	strict,
	stations,
	origin,
	destination,
	tripDuration,
	dateRangeStart,
	dateRangeEnd,
	fares,
	routeLinks,
	dateTimeRequested,
}) {
	const numTravelers = Object.values(travelerTypes).reduce((a, b) => a + b, 0);

	const getNeededInventory = (legAccommodation) =>
		["Roomette", "Bedroom"].includes(legAccommodation.name)
			? Math.ceil(numTravelers / 2)
			: legAccommodation.name === "Family Room"
			? Math.max(
					Math.ceil(
						(travelerTypes.numAdults +
							travelerTypes.numSeniors +
							travelerTypes.numYouth) /
							2
					),
					Math.ceil((travelerTypes.numChildren + travelerTypes.numInfants) / 2)
			  )
			: numTravelers;

	const isDiscountEligible = (legAccommodation, route, senior) =>
		!(route !== "Acela" && legAccommodation.class === "Business") &&
		!(legAccommodation.class === "First") &&
		!(
			!senior &&
			route === "Acela" &&
			[1, 2, 3, 4, 5].includes(
				dayjs(legAccommodation.departureDateTime).get("d")
			)
		);

	function getFare(legAccommodation, route) {
		return (
			(travelerTypes.numAdults + travelerTypes.numYouth) *
				legAccommodation.fare.rail +
			Math.ceil(
				travelerTypes.numSeniors *
					(legAccommodation.fare.rail *
						(isDiscountEligible(legAccommodation, route, true) ? 0.9 : 1)) +
					travelerTypes.numChildren *
						(legAccommodation.fare.rail *
							(isDiscountEligible(legAccommodation, route, false) ? 0.5 : 1)) +
					(travelerTypes.numInfants -
						(travelerTypes.numAdults + travelerTypes.numSeniors) >
					0
						? (travelerTypes.numInfants -
								(travelerTypes.numAdults + travelerTypes.numSeniors)) *
						  (legAccommodation.fare.rail *
								(isDiscountEligible(legAccommodation, route, false) ? 0.5 : 1))
						: 0)
			) +
			legAccommodation.neededInventory * legAccommodation.fare.accommodation
		);
	}

	const [allOptions, setAllOptions] = useState([]);
	const [optionsInDateRange, setOptionsInDateRange] = useState([]);
	const [availableOptionsInDateRange, setAvailableOptionsInDateRange] =
		useState([]);
	const [sortedOptions, setSortedOptions] = useState([]);

	const [avgDelays, setAvgDelays] = useState({});

	const [routes, setRoutes] = useState({});
	const [maxLayovers, setMaxLayovers] = useState(3);
	const [maxPrice, setMaxPrice] = useState(5000);
	const [outboundDeptTime, setOutboundDeptTime] = useState([0, 24]);
	const [outboundArrivalTime, setOutboundArrivalTime] = useState([0, 24]);
	const [returnDeptTime, setReturnDeptTime] = useState([0, 24]);
	const [returnArrivalTime, setReturnArrivalTime] = useState([0, 24]);
	const [outboundDays, setOutboundDays] = useState({
		1: true,
		2: true,
		3: true,
		4: true,
		5: true,
		6: true,
		0: true,
	});
	const [returnDays, setReturnDays] = useState({
		1: true,
		2: true,
		3: true,
		4: true,
		5: true,
		6: true,
		0: true,
	});
	const [maxDuration, setMaxDuration] = useState(100);
	const [amenities, setAmenities] = useState({
		Cafe: false,
		"Checked Baggage": false,
		"Free WiFi": false,
		"Flexible Dining": false,
		"Quiet Car": false,
		"Seat Display": false,
		"Seat Selection": false,
		"Traditional Dining": false,
		"Wheelchair Ramp": false,
	});
	const [addItems, setAddItems] = useState({
		Automobile: false,
		Bicycle: false,
		"Golf Clubs": false,
		Motorcycle: false,
		Offloading: false,
		Pet: false,
		Van: false,
	});

	async function updateAllOptions() {
		const CBN = {
			name: "Canadian Border",
			code: "CBN",
			routes: ["Maple-Leaf"],
		};
		const newAllOptions = [];
		const fareClasses = new Set(["Any class"]);
		const newRoutes = new Set();
		for (const date of structuredClone(fares)) {
			for (const option of date.options) {
				for (const travelLeg of option.travelLegs) {
					travelLeg.legAccommodations = [];
				}
				for (const accommodation of option.accommodations.filter(
					(accommodation) =>
						["Coach", "Business", "First", "Sleeper"].includes(
							accommodation.class
						)
				)) {
					fareClasses.add(accommodation.class);
					for (const [
						i,
						travelLeg,
					] of accommodation.legAccommodations.entries()) {
						for (const legAccommodation of travelLeg) {
							if (i > 0 || legAccommodation.fare.total !== 0) {
								if (
									["Roomette", "Bedroom", "Family Room"].includes(
										legAccommodation.name
									)
								) {
									fareClasses.add(legAccommodation.name);
								}
								option.travelLegs[i].legAccommodations.push({
									class: accommodation.class,
									fareFamily: accommodation.fareFamily,
									...legAccommodation,
								});
							}
						}
					}
				}
				delete option.accommodations;
				for (const travelLeg of option.travelLegs) {
					const originStation = stations.find(
						(station) => station.id === travelLeg.origin
					);
					travelLeg.origin = originStation ? originStation : CBN;
					const destinationStation = stations.find(
						(station) => station.id === travelLeg.destination
					);
					travelLeg.destination = destinationStation ? destinationStation : CBN;
					newRoutes.add(travelLeg.route);
				}
				option.origin = option.travelLegs[0].origin;
				option.destination =
					option.travelLegs[option.travelLegs.length - 1].destination;
				newAllOptions.push(option);
			}
		}
		setRoutes(
			[...newRoutes].sort().reduce((a, b) => ({ ...a, [b]: true }), {})
		);
		setFareClasses(
			[
				"Any class",
				"Coach",
				"Business",
				"First",
				"Sleeper",
				"Roomette",
				"Bedroom",
				"Family Room",
			].filter((fareClass) => fareClasses.has(fareClass))
		);
		setAllOptions(newAllOptions);
		updateOptionsInDateRange(newAllOptions);
	}

	function updateOptionsInDateRange(options) {
		const newOptionsInDateRange = [];
		const dateRangeStartLocal = dayjs(
			`${dateRangeStart.format("M-D-YYYY")}`,
			"M-D-YYYY"
		);
		const dateRangeEndLocal = dayjs(
			`${dateRangeEnd.format("M-D-YYYY")}`,
			"M-D-YYYY"
		);
		for (const option of options) {
			if (
				dayjs(option.departureDateTime).isSameOrAfter(
					dateRangeStartLocal,
					"d"
				) &&
				dayjs(option.departureDateTime).isSameOrBefore(dateRangeEndLocal, "d")
			) {
				newOptionsInDateRange.push(structuredClone(option));
			}
		}
		setOptionsInDateRange(newOptionsInDateRange);
		updateAvailableOptionsInDateRange(newOptionsInDateRange);
	}

	function updateAvailableOptionsInDateRange(options) {
		const newAvailableOptionsInDateRange = [];
		const isSleeper = ["Roomette", "Bedroom", "Family Room"].includes(
			fareClass
		);
		for (const option of structuredClone(options)) {
			let isValid = true;
			for (const leg of option.travelLegs) {
				leg.legAccommodations = leg.legAccommodations
					.map((legAccommodation) => ({
						...legAccommodation,
						neededInventory: getNeededInventory(legAccommodation),
					}))
					.filter(
						(legAccommodation) =>
							legAccommodation.availableInventory >=
								legAccommodation.neededInventory &&
							(fareClass === "Any class" ||
								(legAccommodation.class ===
									(isSleeper ? "Sleeper" : fareClass) &&
									(!strict ||
										(fareClass === "Sleeper" &&
											["Roomette", "Bedroom", "Family Room"].includes(
												legAccommodation.name
											)) ||
										legAccommodation.name.includes(fareClass))))
					)
					.map((legAccommodation) => ({
						...legAccommodation,
						fare: getFare(legAccommodation, leg.route),
						unitFare: legAccommodation.fare.total,
					}));
				if (leg.legAccommodations.length > 0) {
					const match = leg.legAccommodations.find(
						(legAccommodation) => legAccommodation.name === fareClass
					);
					const cheapest = leg.legAccommodations.reduce((a, b) =>
						a.fare <= b.fare ? a : b
					);
					leg.legAccommodation = isSleeper
						? match
							? match
							: cheapest
						: cheapest;
					delete leg.legAccommodations;
					leg.fare = leg.legAccommodation.fare;
				} else {
					isValid = false;
					break;
				}
			}
			if (
				isValid &&
				(isSleeper
					? option.travelLegs.some(
							(leg) => leg.legAccommodation.name === fareClass
					  )
					: true)
			) {
				option.fare = option.travelLegs.reduce((a, b) => a + b.fare, 0);
				newAvailableOptionsInDateRange.push(option);
			}
		}
		setAvailableOptionsInDateRange(newAvailableOptionsInDateRange);
		updateRoundtripOptions(newAvailableOptionsInDateRange);
	}

	function updateRoundtripOptions(options) {
		const includedRoutes = Object.keys(routes).filter((route) => routes[route]);
		const outboundIncludedDays = Object.keys(outboundDays)
			.filter((day) => outboundDays[day])
			.map((day) => Number(day));
		const returnIncludedDays = Object.keys(returnDays)
			.filter((day) => returnDays[day])
			.map((day) => Number(day));
		const includedAmenities = Object.keys(amenities).filter(
			(amenity) => amenities[amenity]
		);
		const includedAddItems = Object.keys(addItems).filter(
			(addItem) => addItems[addItem]
		);
		const numTravelers = Object.values(travelerTypes).reduce(
			(a, b) => a + b,
			0
		);
		const dateRangeStartLocal = dayjs(
			`${dateRangeStart.format("M-D-YYYY")}`,
			"M-D-YYYY"
		);
		const dateRangeEndLocal = dayjs(
			`${dateRangeEnd.format("M-D-YYYY")}`,
			"M-D-YYYY"
		);
		let newRoundtripOptions = [];
		if (roundTrip) {
			const numDays =
				tripDuration.type === "week"
					? tripDuration.val * 7
					: tripDuration.type === "day"
					? tripDuration.val
					: 0;
			options = options.map((option) => ({
				...option,
				departureDateTime: dayjs(option.departureDateTime),
				arrivalDateTime: dayjs(option.arrivalDateTime),
				travelLegs: option.travelLegs.map((leg) => ({
					...leg,
					departureDateTime: dayjs(leg.departureDateTime),
					arrivalDateTime: dayjs(leg.arrivalDateTime),
				})),
			}));
			const deptOptions = options.filter(
				(option) => option.origin.code === origin.code
			);
			const returnOptions = options.filter(
				(option) => option.origin.code === destination.code
			);
			for (const deptOption of deptOptions) {
				for (const returnOption of returnOptions) {
					if (
						deptOption.arrivalDateTime <= returnOption.departureDateTime &&
						(flexible
							? !tripDuration.val ||
							  (numDays > 0
									? returnOption.departureDateTime.diff(
											deptOption.departureDateTime,
											"d"
									  ) +
											1 ===
									  numDays
									: true)
							: deptOption.departureDateTime.isSame(dateRangeStartLocal, "d") &&
							  returnOption.departureDateTime.isSame(
									dateRangeEndLocal,
									"d"
							  )) &&
						deptOption.travelLegs.every((leg) =>
							includedRoutes.includes(leg.route)
						) &&
						returnOption.travelLegs.every((leg) =>
							includedRoutes.includes(leg.route)
						) &&
						deptOption.travelLegs.length - 1 <= maxLayovers &&
						returnOption.travelLegs.length - 1 <= maxLayovers &&
						(maxPrice === 5000 ||
							(deptOption.fare + returnOption.fare) / numTravelers <=
								maxPrice) &&
						Number(deptOption.departureDateTime.format("H")) >=
							outboundDeptTime[0] &&
						Number(deptOption.departureDateTime.format("H")) <=
							outboundDeptTime[1] &&
						Number(deptOption.arrivalDateTime.format("H")) >=
							outboundArrivalTime[0] &&
						Number(deptOption.arrivalDateTime.format("H")) <=
							outboundArrivalTime[1] &&
						Number(returnOption.departureDateTime.format("H")) >=
							returnDeptTime[0] &&
						Number(returnOption.departureDateTime.format("H")) <=
							returnDeptTime[1] &&
						Number(returnOption.arrivalDateTime.format("H")) >=
							returnArrivalTime[0] &&
						Number(returnOption.arrivalDateTime.format("H")) <=
							returnArrivalTime[1] &&
						outboundIncludedDays.includes(
							deptOption.departureDateTime.get("d")
						) &&
						returnIncludedDays.includes(
							returnOption.departureDateTime.get("d")
						) &&
						(maxDuration === 100 ||
							(deptOption.elapsedSeconds + returnOption.elapsedSeconds) / 3600 <
								maxDuration) &&
						includedAmenities.every((amenity) =>
							deptOption.travelLegs.some(
								(leg) => leg.amenities && leg.amenities.includes(amenity)
							)
						) &&
						includedAmenities.every((amenity) =>
							returnOption.travelLegs.some(
								(leg) => leg.amenities && leg.amenities.includes(amenity)
							)
						) &&
						includedAddItems.every(
							(includedAddItem) =>
								deptOption.addItems &&
								deptOption.addItems
									.map((addItem) => addItem.type)
									.includes(includedAddItem)
						) &&
						includedAddItems.every(
							(includedAddItem) =>
								returnOption.addItems &&
								returnOption.addItems
									.map((addItem) => addItem.type)
									.includes(includedAddItem)
						)
					) {
						newRoundtripOptions.push({
							departureDateTime: deptOption.departureDateTime,
							arrivalDateTime: returnOption.departureDateTime,
							elapsedSeconds:
								deptOption.elapsedSeconds + returnOption.elapsedSeconds,
							travelLegs: [deptOption, returnOption],
							origin: deptOption.origin,
							destination: deptOption.destination,
							fare: deptOption.fare + returnOption.fare,
						});
					}
				}
			}
		} else {
			options = options.map((option) => ({
				...option,
				departureDateTime: dayjs(option.departureDateTime),
				arrivalDateTime: dayjs(option.arrivalDateTime),
			}));
			newRoundtripOptions = options
				.filter(
					(option) =>
						(flexible ||
							option.departureDateTime.isSame(dateRangeStartLocal, "d")) &&
						option.travelLegs.every((leg) =>
							includedRoutes.includes(leg.route)
						) &&
						option.travelLegs.length - 1 <= maxLayovers &&
						(maxPrice === 5000 || option.fare / numTravelers <= maxPrice) &&
						Number(option.departureDateTime.format("H")) >=
							outboundDeptTime[0] &&
						Number(option.departureDateTime.format("H")) <=
							outboundDeptTime[1] &&
						Number(option.arrivalDateTime.format("H")) >=
							outboundArrivalTime[0] &&
						Number(option.arrivalDateTime.format("H")) <=
							outboundArrivalTime[1] &&
						outboundIncludedDays.includes(option.departureDateTime.get("d")) &&
						(maxDuration === 100 ||
							option.elapsedSeconds / 3600 < maxDuration) &&
						includedAmenities.every((amenity) =>
							option.travelLegs.some(
								(leg) => leg.amenities && leg.amenities.includes(amenity)
							)
						) &&
						includedAddItems.every(
							(includedAddItem) =>
								option.addItems &&
								option.addItems
									.map((addItem) => addItem.type)
									.includes(includedAddItem)
						)
				)
				.map((option) => ({
					...option,
					travelLegs: [
						{
							...option,
							travelLegs: option.travelLegs.map((leg) => ({
								...leg,
								departureDateTime: dayjs(leg.departureDateTime),
								arrivalDateTime: dayjs(leg.arrivalDateTime),
							})),
						},
					],
				}));
		}
		updateChart(newRoundtripOptions);
		sortOptions(newRoundtripOptions);
	}

	const [chartXData, setChartXData] = useState([]);
	const [chartYData, setChartYData] = useState([]);

	function updateChart(options) {
		if (options.length === 0) {
			return;
		}
		options = options
			.map((option) => ({
				...option,
				departureDateTime: option.departureDateTime.startOf("d"),
			}))
			.sort((a, b) => a.departureDateTime - b.departureDateTime);
		const newChartX = [];
		const newChartY = [];
		let prevPrevDate = null;
		let prevDate = options[0].departureDateTime;
		let minFare = options[0].fare;
		for (let i = 0; i < options.length; i++) {
			let curDate = options[i].departureDateTime;
			let curFare = options[i].fare;
			if (curDate.format("M/D") !== prevDate.format("M/D")) {
				if (
					curDate.diff(prevDate, "d") > 1 &&
					(prevPrevDate === null || prevDate.diff(prevPrevDate, "d") > 1)
				) {
					newChartX.push(prevDate.subtract(12, "h").toDate());
					newChartY.push(minFare);
					newChartX.push(prevDate.add(12, "h").toDate());
					newChartY.push(minFare);
				} else {
					newChartX.push(prevDate.toDate());
					newChartY.push(minFare);
				}
				prevPrevDate = prevDate;
				if (prevDate.format("M/D") !== curDate.subtract(1, "d").format("M/D")) {
					while (prevDate.format("M/D") !== curDate.format("M/D")) {
						newChartX.push(prevDate.toDate());
						newChartY.push(null);
						prevDate = prevDate.add(1, "d");
					}
				}
				prevDate = curDate;
				minFare = curFare;
			} else if (curFare < minFare) {
				minFare = curFare;
			}
		}
		newChartX.push(prevDate.toDate());
		newChartY.push(minFare);
		setChartXData(newChartX);
		setChartYData(newChartY);
	}

	const [sort, setSort] = useState("price");
	const [loading, setLoading] = useState(true);

	function sortOptions(options) {
		const newSortedOptions = options
			.slice()
			.sort(
				sort === "price"
					? (a, b) =>
							a.fare !== b.fare
								? a.fare - b.fare
								: a.elapsedSeconds - b.elapsedSeconds
					: sort === "duration"
					? (a, b) =>
							a.elapsedSeconds !== b.elapsedSeconds
								? a.elapsedSeconds - b.elapsedSeconds
								: a.fare - b.fare
					: sort === "departure"
					? (a, b) =>
							a.departureDateTime !== b.departureDateTime
								? a.departureDateTime - b.departureDateTime
								: a.fare - b.fare
					: (a, b) =>
							a.arrivalDateTime !== b.arrivalDateTime
								? a.arrivalDateTime - b.arrivalDateTime
								: a.fare - b.fare
			);
		if (newSortedOptions.length > 0) {
			const minPrice = newSortedOptions[0].fare;
			const minDuration = newSortedOptions[0].elapsedSeconds;
			for (const [i, option] of newSortedOptions.entries()) {
				option.minPrice =
					option.fare === minPrice && option.elapsedSeconds === minDuration;
				option.marginTop =
					i > 0 && newSortedOptions[i - 1].minPrice && !option.minPrice;
			}
		}
		setSortedOptions(newSortedOptions);
		setLoading(false);
	}

	useEffect(() => {
		setTimeout(updateAllOptions, 100);
	}, []);

	const [initialized, setInitialized] = useState(0);
	function isInitialized() {
		if (initialized === 4) {
			return true;
		} else {
			setInitialized((initialized) => initialized + 1);
			return false;
		}
	}

	useEffect(() => {
		if (!isInitialized()) {
			return;
		}
		setLoading(true);
		setTimeout(() => {
			updateOptionsInDateRange(allOptions);
		}, 100);
	}, [dateRangeStart, dateRangeEnd]);

	useEffect(() => {
		if (!isInitialized()) {
			return;
		}
		setLoading(true);
		setTimeout(() => {
			updateAvailableOptionsInDateRange(optionsInDateRange);
		}, 100);
	}, [
		travelerTypes,
		fareClass,
		strict,
		flexible,
		routes,
		maxLayovers,
		maxPrice,
		outboundDeptTime,
		outboundArrivalTime,
		returnDeptTime,
		returnArrivalTime,
		outboundDays,
		returnDays,
		maxDuration,
		amenities,
		addItems,
	]);

	useEffect(() => {
		if (!isInitialized()) {
			return;
		}
		setLoading(true);
		setTimeout(() => {
			updateRoundtripOptions(availableOptionsInDateRange);
		}, 100);
	}, [tripDuration]);

	useEffect(() => {
		if (!isInitialized()) {
			return;
		}
		sortOptions(sortedOptions);
	}, [sort]);

	const [page, setPage] = useState(0);
	const [rowsPerPage, setRowsPerPage] = useState(10);

	const chartXFormatter = (date) => dayjs(date).format("M/D");
	const chartYFormatter = (fare) => (fare ? `$${fare.toLocaleString()}` : null);

	return (
		<div id="fares-container">
			{sortedOptions.length > 0 && chartXData.length > 1 && (
				<div id="chart-container">
					<LineChart
						height={160}
						series={[
							{
								area: true,
								data: chartYData,
								showMark: false,
								valueFormatter: chartYFormatter,
							},
						]}
						xAxis={[
							{
								data: chartXData,
								scaleType: "time",
								tickNumber: chartXData.length,
								valueFormatter: chartXFormatter,
							},
						]}
						yAxis={[
							{
								max: chartYData.reduce((a, b) => (a > b ? a : b)),
								min: chartYData.reduce((a, b) => (a < b ? a : b)) * (3 / 4),
								valueFormatter: chartYFormatter,
							},
						]}
					>
						<linearGradient
							id="chart-gradient"
							x1="0%"
							y1="0%"
							x2="0%"
							y2="100%"
						>
							<stop offset="0%" stopColor="#4693FF" stopOpacity="1"></stop>
							<stop offset="40%" stopColor="#4693FF" stopOpacity="1"></stop>
							<stop offset="60%" stopColor="#4693FF" stopOpacity="0"></stop>
						</linearGradient>
					</LineChart>
					<div></div>
				</div>
			)}
			{dateTimeRequested && (
				<div>
					<span id="date-time-requested">{`You're viewing a cached search from ${dateTimeRequested
						.local()
						.format("dddd, MMMM Do YYYY")} at ${dateTimeRequested
						.local()
						.format("h:mm a (z)")}`}</span>
				</div>
			)}
			<div id="fares-filters">
				<div>
					<span>Sort by</span>
					<Select
						onChange={(e) => setSort(e.target.value)}
						disableUnderline
						value={sort}
						variant="standard"
					>
						<MenuItem key="price" value="price">
							Price
						</MenuItem>
						<MenuItem key="duration" value="duration">
							Duration
						</MenuItem>
						<MenuItem key="departure" value="departure">
							Departure
						</MenuItem>
						<MenuItem key="arrival" value="arrival">
							Arrival
						</MenuItem>
					</Select>
				</div>
				{sortedOptions.length > 10 && (
					<TablePagination
						component="div"
						count={sortedOptions.length}
						onRowsPerPageChange={(e) => setRowsPerPage(e.target.value)}
						onPageChange={(e, newPage) => setPage(newPage)}
						rowsPerPage={rowsPerPage}
						page={page}
					/>
				)}
				<div>{`${sortedOptions.length.toLocaleString()} option${
					sortedOptions.length !== 1 ? "s" : ""
				}`}</div>
				<Share
					origin={origin}
					destination={destination}
					dateRangeStart={dateRangeStart}
					dateRangeEnd={dateRangeEnd}
					roundTrip={roundTrip}
				/>
			</div>
			<Filters
				routes={routes}
				setRoutes={setRoutes}
				maxLayovers={maxLayovers}
				setMaxLayovers={setMaxLayovers}
				maxPrice={maxPrice}
				setMaxPrice={setMaxPrice}
				outboundDeptTime={outboundDeptTime}
				setOutboundDeptTime={setOutboundDeptTime}
				outboundArrivalTime={outboundArrivalTime}
				setOutboundArrivalTime={setOutboundArrivalTime}
				returnDeptTime={returnDeptTime}
				setReturnDeptTime={setReturnDeptTime}
				returnArrivalTime={returnArrivalTime}
				setReturnArrivalTime={setReturnArrivalTime}
				roundTrip={roundTrip}
				outboundDays={outboundDays}
				setOutboundDays={setOutboundDays}
				returnDays={returnDays}
				setReturnDays={setReturnDays}
				maxDuration={maxDuration}
				setMaxDuration={setMaxDuration}
				amenities={amenities}
				setAmenities={setAmenities}
				addItems={addItems}
				setAddItems={setAddItems}
			/>
			{loading ? (
				<div id="skeleton-container">
					{[...Array(rowsPerPage).keys()].map((i) => (
						<Skeleton key={`skeleton-${i}`} variant="rectangular" />
					))}
				</div>
			) : sortedOptions.length === 0 ? (
				<div id="no-options-container">
					<div>
						<RailwayAlertIcon />
						<span>No options match your search</span>
					</div>
				</div>
			) : (
				<div className="fade-in-translate">
					{sortedOptions
						.slice(rowsPerPage * page, rowsPerPage * (page + 1))
						.map((option, i) => (
							<Option
								avgDelays={avgDelays}
								setAvgDelays={setAvgDelays}
								i={i}
								key={`option-${i}`}
								option={option}
								sort={sort}
								travelerTypes={travelerTypes}
								roundTrip={roundTrip}
								routeLinks={routeLinks}
								outboundDays={outboundDays}
								returnDays={returnDays}
							/>
						))}
				</div>
			)}
		</div>
	);
}
