import unittest

from ohfootball_rating.out_of_state import OHIO, UNKNOWN_STATE, state_label


class StateLabelTests(unittest.TestCase):
    def test_reads_the_state_code_then_the_end_of_the_name(self) -> None:
        cases = (
            (("OH", "Logan"), OHIO),
            (("WV", "Crum (WV)"), "WV"),
            (("", "Crum (WV)"), "WV"),
            (("REGION 0", "Highlands (KY)"), "KY"),
            (("", "Winfield"), UNKNOWN_STATE),
            ((None, "Winfield"), UNKNOWN_STATE),
            (("wv", "x"), UNKNOWN_STATE),
            ((" PA ", "x"), "PA"),
            (("", "Lost (OH)"), UNKNOWN_STATE),
        )
        for (code, name), expected in cases:
            with self.subTest(code=code, name=name):
                self.assertEqual(state_label(code, name), expected)


if __name__ == "__main__":
    unittest.main()
