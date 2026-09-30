import unittest

from ohfootball_recruiting.records import TypedFields, typed_fields, without_nul

# A record as the API gives it.
RECORD = {
    "id": "118416",
    "athleteId": "4428991",
    "recruitType": "HighSchool",
    "year": 2020,
    "ranking": 9,
    "name": "A Player",
    "school": "Princeton",
    "committedTo": "Ohio State",
    "position": "OT",
    "height": 79,
    "weight": 290,
    "stars": 5,
    "rating": 0.9953,
    "city": "Cincinnati",
    "stateProvince": "OH",
    "country": "USA",
    "hometownInfo": {"latitude": 39.1, "longitude": -84.5, "fipsCode": "39061"},
}


class TheTypedFields(unittest.TestCase):
    def test_read_a_full_record(self) -> None:
        self.assertEqual(
            typed_fields(RECORD),
            TypedFields(
                cfbd_id=118416,
                athlete_id=4428991,
                name="A Player",
                school="Princeton",
                city="Cincinnati",
                state_province="OH",
                position="OT",
                stars=5,
                rating=0.9953,
                ranking=9,
                committed_to="Ohio State",
            ),
        )

    def test_are_empty_for_missing_fields(self) -> None:
        self.assertEqual(typed_fields({}), TypedFields(*([None] * 11)))

    def test_are_empty_for_a_wrong_type(self) -> None:
        fields = typed_fields(
            {"id": "12a", "stars": "4", "rating": "0.9", "ranking": True, "school": 7}
        )

        self.assertIsNone(fields.cfbd_id)
        self.assertEqual(fields.stars, 4)
        self.assertIsNone(fields.rating)
        self.assertIsNone(fields.ranking)
        self.assertIsNone(fields.school)

    def test_refuse_digits_that_are_not_ascii(self) -> None:
        self.assertIsNone(typed_fields({"id": "²"}).cfbd_id)

    def test_read_a_whole_number_that_the_api_writes_as_a_float(self) -> None:
        fields = typed_fields({"stars": 5.0, "ranking": 12.0, "id": 3.5})

        self.assertEqual(fields.stars, 5)
        self.assertEqual(fields.ranking, 12)
        self.assertIsNone(fields.cfbd_id)

    def test_are_empty_for_a_number_that_does_not_fit_its_column(self) -> None:
        fields = typed_fields({"id": 2**63, "athleteId": str(2**63), "stars": 2**15, "ranking": -1})

        self.assertEqual(fields, TypedFields(*([None] * 11)))

    def test_read_the_largest_number_of_each_column(self) -> None:
        fields = typed_fields({"id": str(2**63 - 1), "stars": 2**15 - 1, "ranking": 2**31 - 1})

        self.assertEqual(fields.cfbd_id, 2**63 - 1)
        self.assertEqual(fields.stars, 2**15 - 1)
        self.assertEqual(fields.ranking, 2**31 - 1)

    def test_are_empty_for_a_very_long_text_of_digits(self) -> None:
        self.assertIsNone(typed_fields({"id": "9" * 5000}).cfbd_id)

    def test_read_a_rating_that_is_a_whole_number(self) -> None:
        self.assertEqual(typed_fields({"rating": 1}).rating, 1.0)

    def test_read_ids_that_are_numbers(self) -> None:
        self.assertEqual(typed_fields({"id": 5, "athleteId": 6}).athlete_id, 6)

    def test_remove_nul_from_the_text(self) -> None:
        self.assertEqual(typed_fields({"name": "A\x00B"}).name, "AB")


class TheCopyWithoutNul(unittest.TestCase):
    def test_removes_nul_from_nested_texts_and_keys(self) -> None:
        self.assertEqual(
            without_nul({"a\x00": ["b\x00c", {"d": "\x00e"}], "n": 1, "x": None}),
            {"a": ["bc", {"d": "e"}], "n": 1, "x": None},
        )

    def test_keeps_a_record_without_nul(self) -> None:
        self.assertEqual(without_nul(RECORD), RECORD)


if __name__ == "__main__":
    unittest.main()
